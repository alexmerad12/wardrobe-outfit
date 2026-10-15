"""Rebuild the background-removal model that src/lib/cutout/model.ts loads.

Exports BiRefNet-lite (MIT, official code + weights from the Hugging Face
repo ZhengPeng7/BiRefNet_lite) to ONNX at 1024x1024 with three rewrites that
change memory, not math:

1. torchvision's deform_conv2d becomes K*K sequential bilinear GridSample
   taps, each followed by a 1x1 conv and an accumulate. ONNX exporters
   otherwise turn it into gathers over [C x K*K x H x W] tensors: gigabytes
   at 1024 px for the 7x7 kernels.
2. ASPPDeformable's 1280-channel concat + 1x1 conv becomes a running sum of
   per-branch 1x1 convs (the pooled branch is projected at 1x1, then
   broadcast).
3. The decoder tail's 96-channel full-resolution upsample + concat + final
   1x1 conv becomes a 1-channel projection at 256 px that is then upsampled
   (a 1x1 conv commutes with bilinear upsampling) plus the image branch.

Result (2026-10-15): masks identical to the PyTorch model (100.00 % IoU,
max logit difference ~1e-3), ~1.3 GB peak per run in onnxruntime-node with
graphOptimizationLevel "all" and no CPU arena, against ~6 GB for the stock
onnx-community export. The script asserts both the unit-level and the
model-level parity before it writes anything.

Setup (any OS, CPU only; Python 3.12+):
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
  pip install timm transformers kornia einops safetensors onnx pillow numpy
  Download birefnet.py, BiRefNet_config.py and model.safetensors from
  https://huggingface.co/ZhengPeng7/BiRefNet_lite into <src_dir>.

Run:
  python export_birefnet_lite_lean.py <src_dir> <any_photo.jpg> <out.onnx>

Then upload <out.onnx> to the project's Vercel Blob store under a
content-addressed name (models/birefnet-lite-lean-<sha256[:12]>.onnx,
public, cache-control 1 year) and update MODEL_SHA256 / DEFAULT_MODEL_URL
in src/lib/cutout/model.ts.
"""
import inspect
import shutil
import sys
import textwrap
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from safetensors.torch import load_file
from torchvision.ops import deform_conv2d as tv_deform_conv2d

src, photo, out_path = map(Path, sys.argv[1:4])
torch.set_grad_enabled(False)
torch.manual_seed(0)

# The official file uses a relative import, so load it as a package.
pkg = out_path.parent / "brnpkg"
pkg.mkdir(exist_ok=True)
for f in ("birefnet.py", "BiRefNet_config.py"):
    shutil.copy(src / f, pkg / f)
(pkg / "__init__.py").write_text("")
sys.path.insert(0, str(pkg.parent))
import brnpkg.birefnet as B  # noqa: E402


def _pair(v):
    return tuple(v) if isinstance(v, (tuple, list)) else (v, v)


def deform_conv2d_lean(input, offset, weight, bias=None, stride=(1, 1), padding=(0, 0), dilation=(1, 1), mask=None):
    """torchvision.ops.deform_conv2d (groups=1, offset_groups=1) as K*K GridSample taps."""
    sh, sw = _pair(stride)
    ph, pw = _pair(padding)
    dh, dw = _pair(dilation)
    _, _, H, W = input.shape
    _, _, kh, kw = weight.shape
    Ho, Wo = offset.shape[-2], offset.shape[-1]
    base_y = (torch.arange(Ho, dtype=input.dtype) * sh - ph).view(1, Ho, 1)
    base_x = (torch.arange(Wo, dtype=input.dtype) * sw - pw).view(1, 1, Wo)
    out = None
    for i in range(kh):
        for j in range(kw):
            k = i * kw + j
            py = base_y + i * dh + offset[:, 2 * k]
            px = base_x + j * dw + offset[:, 2 * k + 1]
            grid = torch.stack((px * (2.0 / (W - 1)) - 1.0, py * (2.0 / (H - 1)) - 1.0), dim=-1)
            sampled = F.grid_sample(input, grid, mode="bilinear", padding_mode="zeros", align_corners=True)
            if mask is not None:
                sampled = sampled * mask[:, k : k + 1]
            contrib = F.conv2d(sampled, weight[:, :, i : i + 1, j : j + 1])
            out = contrib if out is None else out + contrib
    if bias is not None:
        out = out + bias.view(1, -1, 1, 1)
    return out


def aspp_forward_lean(self, x):
    """ASPPDeformable.forward without the 1280-channel concat."""
    w = self.conv1.weight
    c = self.in_channelster
    acc = None
    for idx, branch in enumerate([self.aspp1, *self.aspp_deforms]):
        part = F.conv2d(branch(x), w[:, idx * c : (idx + 1) * c])
        acc = part if acc is None else acc + part
    n = 1 + len(self.aspp_deforms)
    acc = acc + F.conv2d(self.global_avg_pool(x), w[:, n * c : (n + 1) * c])
    return self.relu(self.bn1(acc))  # dropout is the identity in eval


def _lean_tail(self, p, x):
    """conv_out1(cat(up(p), ipt)) == up(conv_a(p) + bias) + conv_b(ipt).

    With a full-resolution patch reference, image2patches is a 1x1 grid,
    i.e. x itself.
    """
    conv = self.conv_out1[0]
    if not self.config.dec_ipt:
        return conv(F.interpolate(p, size=x.shape[2:], mode="bilinear", align_corners=True))
    ca = p.shape[1]
    ipt = self.ipt_blk1(F.interpolate(x, size=x.shape[2:], mode="bilinear", align_corners=True))
    low = F.conv2d(p, conv.weight[:, :ca], conv.bias)
    return F.interpolate(low, size=x.shape[2:], mode="bilinear", align_corners=True) + F.conv2d(ipt, conv.weight[:, ca:])


def patch_decoder_tail():
    lines = textwrap.dedent(inspect.getsource(B.Decoder.forward)).split("\n")
    start = max(i for i, l in enumerate(lines) if l.strip() == "_p1 = self.decoder_block1(_p1)")
    end = next(i for i, l in enumerate(lines) if l.strip() == "p1_out = self.conv_out1(_p1)")
    assert start < end and end - start <= 8, "upstream decoder changed; re-check the tail rewrite"
    indent = lines[start][: len(lines[start]) - len(lines[start].lstrip())]
    lines[start : end + 1] = [f"{indent}_p1 = self.decoder_block1(_p1)", f"{indent}p1_out = _lean_tail(self, _p1, x)"]
    B._lean_tail = _lean_tail
    ns = {}
    exec(compile("\n".join(lines), "decoder_forward_lean", "exec"), B.__dict__, ns)
    B.Decoder.forward = ns["forward"]


# 1. Unit parity of the deformable conv against torchvision.
worst = 0.0
for k, H in ((1, 32), (3, 32), (7, 32), (3, 48), (7, 64)):
    x = torch.randn(1, 16, H, H)
    w = torch.randn(24, 16, k, k) * 0.1
    b = torch.randn(24)
    off = torch.randn(1, 2 * k * k, H, H) * 3.0  # several px, some out of bounds
    m = 2.0 * torch.sigmoid(torch.randn(1, k * k, H, H))
    ref = tv_deform_conv2d(input=x, offset=off, weight=w, bias=b, padding=k // 2, mask=m, stride=(1, 1))
    got = deform_conv2d_lean(input=x, offset=off, weight=w, bias=b, padding=k // 2, mask=m, stride=(1, 1))
    worst = max(worst, (ref - got).abs().max().item())
print(f"deform conv unit parity: max abs diff {worst:.2e}")
assert worst < 1e-3

# 2. Official model + weights.
model = B.BiRefNet(bb_pretrained=False)
model.load_state_dict(load_file(str(src / "model.safetensors")), strict=True)
model.eval()

img = Image.open(photo).convert("RGB").resize((1024, 1024), Image.LANCZOS)
arr = (np.asarray(img, dtype=np.float32) / 255.0 - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
x = torch.from_numpy(arr.transpose(2, 0, 1)[None].astype(np.float32))
ref = model(x)[-1]

# 3. Lean rewrites, then model-level parity.
B.deform_conv2d = deform_conv2d_lean  # the module calls the name it imported
B.ASPPDeformable.forward = aspp_forward_lean
patch_decoder_tail()
got = model(x)[-1]
d = (ref - got).abs().max().item()
pr, pg = ref > 0, got > 0
iou = (pr & pg).sum().item() / max(1, (pr | pg).sum().item())
print(f"model parity: max |logit diff| {d:.2e}, mask IoU {iou * 100:.4f}%")
assert iou > 0.999 and d < 0.05


class Wrapper(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, input_image):
        return self.m(input_image)[-1]  # full-resolution logits


# 4. Export (logits out, like the stock export, so model.ts is unchanged).
t0 = time.time()
torch.onnx.export(
    Wrapper(model).eval(), (x,), str(out_path), input_names=["input_image"], output_names=["output_image"],
    opset_version=17, dynamo=False, do_constant_folding=True,
)
print(f"exported {out_path} ({out_path.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")
