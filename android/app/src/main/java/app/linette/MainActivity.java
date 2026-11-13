package app.linette;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.WebViewListener;

// The whole app is the site (https://linette.app) in the phone's WebView:
// see capacitor.config.ts at the repo root. This class only smooths the
// first second of a launch, saves the session when the app is left, and
// writes down why a page failed to load.
public class MainActivity extends BridgeActivity {

    private static final String TAG = "Linette";

    // The longest the system's launch screen waits for the site's first
    // page. Android counts an app as slow to start from 5 seconds.
    private static final long LAUNCH_SCREEN_MAX_MS = 3000;

    private volatile boolean firstPageReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen launchScreen = SplashScreen.installSplashScreen(this);
        // Android 16 draws every app edge to edge and no longer lets an
        // app opt out. Asking for it here, before the bridge starts, gives
        // older Android versions the same layout (Capacitor's own advice
        // while its SystemBars plugin is not set to "disable"). The site
        // keeps its content clear of the bars with env(safe-area-inset-*).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        // Keep the launch screen (black, white L) until the site's first
        // page can be drawn: that page opens on the site's own black launch
        // screen, so the two join without an empty screen between them.
        // Released as well when the page fails (Capacitor then shows
        // native-shell/offline.html) and after LAUNCH_SCREEN_MAX_MS.
        launchScreen.setKeepOnScreenCondition(() -> !firstPageReady);
        new Handler(Looper.getMainLooper()).postDelayed(() -> firstPageReady = true, LAUNCH_SCREEN_MAX_MS);
        if (bridge == null) {
            // No WebView on this device: Capacitor shows its own message.
            firstPageReady = true;
            return;
        }
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    if (!firstPageReady) {
                        boolean offline = url != null && url.contains("/offline.html");
                        Log.i(TAG, "first page shown: " + (offline ? "the offline page" : "the site"));
                    }
                    firstPageReady = true;
                }

                @Override
                public void onReceivedError(WebView view) {
                    firstPageReady = true;
                }

                @Override
                public void onReceivedHttpError(WebView view) {
                    firstPageReady = true;
                }
            }
        );

        // Capacitor's own page-load client, unchanged except that it logs
        // why a request failed. Capacitor shows the same offline page for
        // a missing network and for a page the site refused, and logs
        // neither. The lines carry the error and whether it was the page
        // or something inside it: no address, no user data.
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    Log.w(
                        TAG,
                        (request.isForMainFrame() ? "page" : "resource") + " failed: " + error.getErrorCode() + " " + error.getDescription()
                    );
                    super.onReceivedError(view, request, error);
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                    if (request.isForMainFrame()) {
                        Log.w(TAG, "page answered HTTP " + errorResponse.getStatusCode());
                    }
                    super.onReceivedHttpError(view, request, errorResponse);
                }
            }
        );
    }

    @Override
    public void onPause() {
        super.onPause();
        // The session is a cookie, and the WebView writes cookies to disk
        // only every 30 seconds or so. Someone who signs in and swipes the
        // app away at once would be signed out at the next launch (and a
        // refreshed session could be lost the same way). Write them now.
        CookieManager.getInstance().flush();
    }
}
