// FAQ — bilingual (EN / FR). Same structural pattern as /privacy and
// /terms: client component, useLocale to pick the locale, two large
// JSX blocks side by side. Flat list (not accordion) — content scans
// faster on mobile when nothing has to be tapped to expand.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/lib/i18n/use-locale";

const CONTACT_EMAIL = "hello@linette.app";

// Back-arrow header — uses browser history so the user lands wherever
// they came from (Settings most often, but also Privacy / Terms / a
// shared link landing). If history is empty (direct visit), router.back
// is a no-op; the footer links to Privacy / Terms cover that case.
function BackArrow({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label={label}
      className="inline-flex h-9 w-9 -ml-2 mb-4 items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}

export default function FAQPage() {
  const { locale } = useLocale();
  return locale === "fr" ? <FrenchFAQ /> : <EnglishFAQ />;
}

// Shared question wrapper — keeps the spacing + heading style
// consistent without repeating Tailwind classes everywhere.
function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="font-semibold text-base mb-1.5">{q}</h3>
      <div className="text-sm leading-relaxed text-foreground/80 space-y-2">
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-[family-name:var(--font-heading)] text-xl mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EnglishFAQ() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed">
      <BackArrow label="Back" />
      <h1 className="font-[family-name:var(--font-heading)] text-3xl mb-2">
        Frequently asked questions
      </h1>
      <p className="text-muted-foreground mb-10">
        Common questions, honestly answered. If yours isn&apos;t here, write to{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <Section title="Who is Linette?">
        <Q q="Who is Linette, exactly?">
          <p>
            Linette is your AI stylist — picture the friend who&apos;d remember
            every piece in your closet and text you a complete outfit when
            you ask what to wear. She has a soft spot for editorial fashion,
            a strong opinion on belts (always), and a soft spot for the
            French half of her vocabulary. Most importantly: she refuses to
            suggest pieces you don&apos;t already own. New clothes aren&apos;t her
            thing — she believes most people have everything they need, they
            just can&apos;t see it. The &quot;for the closet you already own&quot;
            line is hers.
          </p>
          <p>A few quirks worth knowing:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>She speaks English and French, and switches based on your preference.</li>
            <li>She won&apos;t let you wear sandals in the rain.</li>
            <li>
              She only allows mixing metals when your mood is &quot;Playful.&quot;
              Otherwise — gold with gold, silver with silver.
            </li>
            <li>She doesn&apos;t sleep. She has opinions about late-night outfit decisions.</li>
          </ul>
        </Q>
      </Section>

      <Section title="Getting started">
        <Q q="How do I add items to my wardrobe?">
          <p>
            Tap the camera or upload icon, snap or pick a photo of a clothing
            piece, and Linette handles the rest — background removed, color
            and material read automatically, and the item saved to your
            wardrobe.
          </p>
        </Q>
        <Q q="Can I add many items at once?">
          <p>
            Yes — there&apos;s a bulk upload mode. Pick as many photos as you
            want; Linette processes them in the background. You can keep
            using the app while it works, just don&apos;t close the tab.
          </p>
        </Q>
        <Q q="What if Linette tags an item incorrectly?">
          <p>
            Tap into the item and edit any field — category, color, material,
            occasions, seasons. Your edits are what Linette uses going
            forward.
          </p>
        </Q>
        <Q q="Why does Linette ask for my location?">
          <p>
            For weather. Outfit suggestions adjust to the temperature and
            conditions where you are. You can use a fixed city in Settings if
            you&apos;d rather not share device location.
          </p>
        </Q>
      </Section>

      <Section title="Outfit suggestions">
        <Q q="How does Linette pick outfits?">
          <p>
            She reads your wardrobe — every piece you&apos;ve added, with its
            color, material, occasion tags, and how often you&apos;ve worn it —
            and combines them according to styling rules (silhouette
            balance, color harmony, weather, mood, occasion). She also
            learns from outfits you favorite over time.
          </p>
        </Q>
        <Q q="I keep seeing the same items — why?">
          <p>
            Linette tries to rotate your wardrobe, but if certain pieces
            anchor a lot of your favorites or are the only items that fit the
            weather and occasion, they&apos;ll come up more. Tap &quot;Show me
            another&quot; for a fresh combination.
          </p>
        </Q>
        <Q q="How do I save an outfit?">
          <p>
            Tap the heart on any suggestion. Saved outfits live under
            Favorites, and Linette learns your taste from them.
          </p>
        </Q>
        <Q q="Can I tell Linette I'm in a different mood or going somewhere specific?">
          <p>
            Yes — on the Suggest screen, set a mood (Confident, Cozy,
            Playful, Bold, etc.) and an occasion (Work, Date, Brunch,
            Formal). You can also add a free-text style direction like
            &quot;more drapey&quot; or &quot;all black.&quot;
          </p>
        </Q>
      </Section>

      <Section title="Account & privacy">
        <Q q="How do I change my password?">
          <p>
            Profile → Settings → Account &amp; security → Change password.
            You&apos;ll be asked for your current password first.
          </p>
        </Q>
        <Q q="How do I delete my account?">
          <p>
            Profile → Settings → Account &amp; security → Close your account.
            This is permanent — your wardrobe, saved outfits, preferences,
            and account are deleted forever.
          </p>
        </Q>
        <Q q="How do I download all my data?">
          <p>
            Profile → Settings → Account &amp; security → Download my data.
            You&apos;ll get a JSON file with every piece, outfit, and preference
            on your account.
          </p>
        </Q>
        <Q q="Where are my photos stored? Do you sell my data?">
          <p>
            Photos live in Supabase and Vercel object storage, with row-level
            security so only your account can read them. We do not sell your
            data. Details in our{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Q>
      </Section>

      <Section title="Pricing & support">
        <Q q="Is Linette free?">
          <p>
            Linette is free during the beta. Paid plans are coming later this
            year — a Linette tier and an Atelier tier, both yearly. You&apos;ll
            see them before you&apos;re asked to pay anything.
          </p>
        </Q>
        <Q q="I have a question, bug, or idea — how do I reach you?">
          <p>
            Write to{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . A real person reads every email — usually within a day or two.
          </p>
        </Q>
      </Section>

      <div className="mt-12 flex gap-6 text-sm">
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>
      </div>
    </div>
  );
}

function FrenchFAQ() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed">
      <BackArrow label="Retour" />
      <h1 className="font-[family-name:var(--font-heading)] text-3xl mb-2">
        Questions fréquentes
      </h1>
      <p className="text-muted-foreground mb-10">
        Les questions qui reviennent, répondues honnêtement. Si la tienne
        n&apos;y est pas, écris-nous à{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <Section title="Qui est Linette ?">
        <Q q="Qui est Linette, au juste ?">
          <p>
            Linette est ta styliste IA — imagine l&apos;amie qui se souviendrait
            de chaque pièce dans ton dressing et qui te texterait une tenue
            complète quand tu lui demandes quoi porter. Elle a un faible
            pour la mode éditoriale, une opinion très claire sur les
            ceintures (toujours), et un petit faible pour la moitié
            française de son vocabulaire. Surtout : elle refuse de suggérer
            des pièces que tu ne possèdes pas déjà. Les achats neufs, ce
            n&apos;est pas son truc — elle pense que la plupart des gens ont
            déjà tout ce qu&apos;il leur faut, ils ne le voient juste pas. La
            phrase « pour la garde-robe que tu as déjà » vient d&apos;elle.
          </p>
          <p>Quelques particularités à savoir :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Elle parle anglais et français, et bascule selon ta préférence.</li>
            <li>Elle ne te laissera pas porter des sandales sous la pluie.</li>
            <li>
              Elle ne permet de mélanger les métaux que lorsque ton humeur est
              « Fun ». Sinon — or avec or, argent avec argent.
            </li>
            <li>
              Elle ne dort pas. Elle a donc des opinions sur les choix de
              tenue de fin de soirée.
            </li>
          </ul>
        </Q>
      </Section>

      <Section title="Pour commencer">
        <Q q="Comment j'ajoute des pièces à mon dressing ?">
          <p>
            Appuie sur l&apos;icône appareil photo ou téléversement, prends ou
            choisis une photo d&apos;un vêtement, et Linette s&apos;occupe du reste —
            le fond est retiré, la couleur et la matière sont lues
            automatiquement, et la pièce est enregistrée dans ton dressing.
          </p>
        </Q>
        <Q q="Je peux en ajouter plusieurs à la fois ?">
          <p>
            Oui — il y a un mode téléversement en lot. Choisis autant de
            photos que tu veux ; Linette les traite en arrière-plan. Tu peux
            continuer à utiliser l&apos;app pendant ce temps, ne ferme juste
            pas l&apos;onglet.
          </p>
        </Q>
        <Q q="Et si Linette catégorise mal une pièce ?">
          <p>
            Ouvre la pièce et modifie n&apos;importe quel champ — catégorie,
            couleur, matière, occasions, saisons. Tes corrections sont ce
            que Linette utilise par la suite.
          </p>
        </Q>
        <Q q="Pourquoi Linette demande ma localisation ?">
          <p>
            Pour la météo. Les suggestions s&apos;adaptent à la température et
            aux conditions là où tu te trouves. Tu peux aussi enregistrer
            une ville fixe dans les paramètres si tu préfères ne pas
            partager ta position en temps réel.
          </p>
        </Q>
      </Section>

      <Section title="Suggestions de tenues">
        <Q q="Comment Linette choisit les tenues ?">
          <p>
            Elle lit ton dressing — chaque pièce que tu as ajoutée, avec sa
            couleur, sa matière, ses occasions, et la fréquence de port — et
            les combine selon des règles de style (équilibre des
            silhouettes, harmonie des couleurs, météo, humeur, occasion).
            Elle apprend aussi de tes tenues favorites au fil du temps.
          </p>
        </Q>
        <Q q="Je vois souvent les mêmes pièces — pourquoi ?">
          <p>
            Linette essaie de faire tourner ton dressing, mais si certaines
            pièces ancrent beaucoup de tes favoris ou sont les seules à
            convenir à la météo et à l&apos;occasion, elles reviendront plus
            souvent. Appuie sur « Une autre » pour une nouvelle
            combinaison.
          </p>
        </Q>
        <Q q="Comment enregistrer une tenue ?">
          <p>
            Appuie sur le cœur d&apos;une suggestion. Les tenues enregistrées
            vivent dans Favoris, et Linette apprend ton goût à partir
            d&apos;elles.
          </p>
        </Q>
        <Q q="Je peux dire à Linette que je suis d'humeur différente ou que je vais quelque part de précis ?">
          <p>
            Oui — sur l&apos;écran Suggest, choisis une humeur (Confiante,
            Cocooning, Fun, Audacieuse, etc.) et une occasion (Travail,
            Date, Brunch, Formel). Tu peux aussi ajouter une indication
            libre comme « plus fluide » ou « tout en noir ».
          </p>
        </Q>
      </Section>

      <Section title="Compte & confidentialité">
        <Q q="Comment changer mon mot de passe ?">
          <p>
            Profil → Paramètres → Compte &amp; sécurité → Changer le mot de
            passe. On te demandera d&apos;abord ton mot de passe actuel.
          </p>
        </Q>
        <Q q="Comment supprimer mon compte ?">
          <p>
            Profil → Paramètres → Compte &amp; sécurité → Fermer ton compte.
            C&apos;est définitif — ton dressing, tes tenues sauvegardées, tes
            préférences et ton compte sont supprimés pour toujours.
          </p>
        </Q>
        <Q q="Comment télécharger toutes mes données ?">
          <p>
            Profil → Paramètres → Compte &amp; sécurité → Télécharger mes
            données. Tu obtiens un fichier JSON avec chaque pièce, tenue et
            préférence de ton compte.
          </p>
        </Q>
        <Q q="Où sont stockées mes photos ? Vendez-vous mes données ?">
          <p>
            Les photos sont stockées chez Supabase et Vercel, avec sécurité
            au niveau des lignes — seul ton compte peut les lire. Nous ne
            vendons pas tes données. Détails dans notre{" "}
            <Link href="/privacy" className="underline">
              Politique de confidentialité
            </Link>
            .
          </p>
        </Q>
      </Section>

      <Section title="Tarifs & support">
        <Q q="Est-ce que Linette est gratuit ?">
          <p>
            Linette est gratuit pendant la phase bêta. Les forfaits payants
            arrivent plus tard cette année — un forfait Linette et un
            forfait Atelier, tous deux annuels. Tu les verras avant
            qu&apos;on te demande de payer quoi que ce soit.
          </p>
        </Q>
        <Q q="J'ai une question, un bug, une idée — comment vous joindre ?">
          <p>
            Écris-nous à{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . Une vraie personne lit chaque e-mail — généralement dans la
            journée ou deux.
          </p>
        </Q>
      </Section>

      <div className="mt-12 flex gap-6 text-sm">
        <Link href="/privacy" className="underline">
          Politique de confidentialité
        </Link>
        <Link href="/terms" className="underline">
          Conditions d&apos;utilisation
        </Link>
      </div>
    </div>
  );
}
