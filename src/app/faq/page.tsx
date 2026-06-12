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
            a strong opinion on belts (always), and a weakness for the
            French half of her vocabulary. Most importantly: she refuses to
            suggest pieces you don&apos;t already own. New clothes aren&apos;t her
            thing — she believes most people have everything they need, they
            just can&apos;t see it. The &quot;for the closet you already own&quot;
            line is hers.
          </p>
          <p>A few quirks worth knowing:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>She speaks English and French, and switches based on your preference.</li>
            <li>Rain in the forecast? Don&apos;t expect her to sign off on suede.</li>
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
            Yes — there&apos;s a bulk upload mode. Pick up to 10 photos at a
            time; Linette processes them in the background. You can keep
            using the app while it works, just don&apos;t close the tab.
            Need to add more than 10? Finish the batch, then pick another.
          </p>
        </Q>
        <Q q="Can I check if a piece would work before I buy it?">
          <p>
            Tap &quot;Try it before buying&quot;, snap a photo of an item
            you&apos;re considering, and Linette tells you if you already
            own similar pieces and how you could style it with what&apos;s
            in your wardrobe.
          </p>
        </Q>
        <Q q="Can I hide off-season pieces?">
          <p>
            Open any item, tap &quot;Edit details&quot;, and toggle
            &quot;Pack away&quot; near the bottom. Packed-away pieces stay
            in your wardrobe but don&apos;t appear in suggestions or the
            default grid until you bring them back. To pack away many
            pieces at once, multi-select items in your Wardrobe and tap
            the storage action.
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
            balance, color harmony, weather, mood, occasion).
          </p>
        </Q>
        <Q q="I keep seeing the same items — why?">
          <p>
            Linette tries to rotate your wardrobe, but if certain pieces
            anchor a lot of your favorites or are the only items that fit the
            weather and occasion, they&apos;ll come up more. Tap &quot;Show me
            another&quot; for a fresh combination — just know each one counts
            toward your daily suggestion limit (see &quot;Is Linette
            free?&quot; below).
          </p>
        </Q>
        <Q q="How do I save an outfit?">
          <p>
            Tap the heart on any suggestion. Saved outfits live under
            Favorites, and Linette learns your taste from them.
          </p>
        </Q>
        <Q q="How does Linette learn from my favorites?">
          <p>
            Your favorites tell her which color palettes you gravitate to,
            which silhouettes recur, which pieces anchor a lot of your
            outfits, and which fits and cuts you keep coming back to. On
            each request she studies a small rotating sample of them so no
            single look takes over — a handful of genuine favorites guides
            her better than hearting everything.
          </p>
        </Q>
        <Q q="What does the heart on a single piece do?">
          <p>
            It marks that piece as a favorite. Linette gives favorited
            pieces a soft preference in her suggestions when they fit the
            brief, and you can tap the &quot;Favorites&quot; tab in your
            Wardrobe to quickly find the pieces you love most.
          </p>
        </Q>
        <Q q="Can I give Linette a specific want or context?">
          <p>
            Yes — on the Suggest screen, in addition to mood and occasion,
            you can add a free-text direction. For example: &quot;I want to
            wear my red boots,&quot; &quot;all black,&quot; or &quot;I&apos;m
            going to a wedding.&quot;
          </p>
        </Q>
        <Q q="Can I get a suggestion built around a specific piece?">
          <p>
            Open any item in your wardrobe and tap &quot;Outfit with
            this&quot;. Linette builds a suggestion around that piece, so
            you can style something you specifically want to wear.
          </p>
        </Q>
        <Q q="Can I build my own outfit instead of asking Linette?">
          <p>
            In your Wardrobe, tap to select two or more items, then tap
            &quot;Outfit&quot; to compose it yourself. It&apos;s saved to
            your Favorites, where you can wear it today or keep it for
            later.
          </p>
        </Q>
        <Q q="Why does Linette never suggest some of my favorite pieces for certain occasions?">
          <p>
            Linette uses each item&apos;s &quot;Occasions&quot; tags to
            decide where it fits. If she&apos;s filtering out a piece
            you&apos;d actually wear for work or a date, open the item,
            tap &quot;Edit details&quot;, and add the occasion you want.
            She&apos;ll trust your call over her default filter — useful
            when your workplace is more relaxed than the average, or
            when a piece reads casual but feels right to you for a
            specific event.
          </p>
        </Q>
        <Q q="Can I swap just one piece in a suggestion?">
          <p>
            Tap the shuffle icon on any item in a suggested outfit and
            pick a replacement from your wardrobe — the rest of the look
            stays intact, and Linette rewrites her styling notes around
            your swap.
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
            Photos live in object storage at Supabase, our database
            provider. Your wardrobe data is protected by row-level security,
            so only your signed-in account can access it. We do not sell
            your data. Details in our{" "}
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
            Linette is free during the beta. To keep the lights on, AI
            features have daily limits — currently 3 outfit suggestions,
            3 try-ons, and 2 packing lists per day. Paid plans will come
            later; you&apos;ll see them in the app well before you&apos;re
            asked to pay anything.
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
            ceintures (toujours), et un penchant pour la moitié
            française de son vocabulaire. Surtout : elle refuse de suggérer
            des pièces que tu ne possèdes pas déjà. Les achats neufs, ce
            n&apos;est pas son truc — elle pense que la plupart des gens ont
            déjà tout ce qu&apos;il leur faut, ils ne le voient juste pas. La
            phrase « pour la garde-robe que tu as déjà » vient d&apos;elle.
          </p>
          <p>Quelques particularités à savoir :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Elle parle anglais et français, et bascule selon ta préférence.</li>
            <li>De la pluie au programme ? Ne compte pas sur elle pour approuver le suède.</li>
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
            Oui — il y a un mode téléversement en lot. Choisis jusqu&apos;à
            10 photos à la fois ; Linette les traite en arrière-plan. Tu
            peux continuer à utiliser l&apos;app pendant ce temps, ne ferme
            juste pas l&apos;onglet. Tu en as plus de 10 ? Termine le lot,
            puis recommence.
          </p>
        </Q>
        <Q q="Je peux vérifier si une pièce me conviendrait avant de l'acheter ?">
          <p>
            Tape sur « Essaie avant d&apos;acheter », prends en photo une
            pièce qui te tente, et Linette te dit si tu as déjà des items
            similaires et comment tu pourrais la styler avec ce que tu as
            déjà dans ton dressing.
          </p>
        </Q>
        <Q q="Je peux cacher mes pièces hors saison ?">
          <p>
            Ouvre n&apos;importe quel item, tape sur « Modifier les
            détails », puis active « Ranger » en bas de la page. Les
            pièces rangées restent dans ton dressing mais n&apos;apparaissent
            plus dans les suggestions ni dans la grille par défaut jusqu&apos;à
            ce que tu les ressortes. Pour en ranger plusieurs d&apos;un
            coup, sélectionne plusieurs pièces dans ton Dressing et tape
            sur l&apos;action de rangement.
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
          </p>
        </Q>
        <Q q="Je vois souvent les mêmes pièces — pourquoi ?">
          <p>
            Linette essaie de faire tourner ton dressing, mais si certaines
            pièces ancrent beaucoup de tes favoris ou sont les seules à
            convenir à la météo et à l&apos;occasion, elles reviendront plus
            souvent. Appuie sur « Une autre suggestion » pour une nouvelle
            combinaison — chaque demande compte toutefois dans ta limite
            quotidienne (voir « Est-ce que Linette est gratuit ? » plus
            bas).
          </p>
        </Q>
        <Q q="Comment enregistrer une tenue ?">
          <p>
            Appuie sur le cœur d&apos;une suggestion. Les tenues enregistrées
            vivent dans Favoris, et Linette apprend ton goût à partir
            d&apos;elles.
          </p>
        </Q>
        <Q q="Comment Linette apprend de mes favoris ?">
          <p>
            Tes favoris lui montrent les palettes de couleurs que tu
            privilégies, les silhouettes qui reviennent, les pièces qui
            ancrent beaucoup de tes tenues, et les coupes auxquelles tu
            retournes toujours. À chaque demande, elle étudie un petit
            échantillon tournant de tes favoris pour qu&apos;aucun look ne
            prenne toute la place — quelques vrais coups de cœur la
            guident mieux qu&apos;un cœur sur tout.
          </p>
        </Q>
        <Q q="À quoi sert le cœur sur une pièce individuelle ?">
          <p>
            Il marque la pièce comme favorite. Linette propose plus
            souvent les pièces favorites dans ses suggestions quand elles
            correspondent à ce que tu cherches, et tu peux taper sur
            l&apos;onglet « Favoris » dans ton Dressing pour retrouver
            d&apos;un coup les pièces que tu préfères.
          </p>
        </Q>
        <Q q="Je peux dire à Linette une envie ou un contexte particulier ?">
          <p>
            Oui — sur l&apos;écran Suggest, en plus de l&apos;humeur et de
            l&apos;occasion, tu peux écrire une indication libre. Par
            exemple : « Je veux porter mes bottes rouges », « tout en
            noir », ou « je vais à un mariage ».
          </p>
        </Q>
        <Q q="Je peux avoir une suggestion construite autour d'une pièce précise ?">
          <p>
            Ouvre n&apos;importe quelle pièce dans ton dressing et tape sur
            « Styler cet item ». Linette construit une suggestion autour
            de cette pièce, parfait quand tu veux porter quelque chose de
            précis.
          </p>
        </Q>
        <Q q="Je peux composer ma propre tenue plutôt que demander à Linette ?">
          <p>
            Dans ton Dressing, tape pour sélectionner deux pièces ou plus,
            puis tape sur « Tenue » pour la composer toi-même. Elle est
            enregistrée dans tes Favoris, d&apos;où tu peux la porter
            aujourd&apos;hui ou la garder pour plus tard.
          </p>
        </Q>
        <Q q="Pourquoi Linette ne propose jamais certaines de mes pièces préférées pour certaines occasions ?">
          <p>
            Linette se sert des tags « Occasions » de chaque pièce pour
            décider où elle convient. Si elle écarte une pièce que tu
            porterais vraiment au travail ou à un rendez-vous, ouvre la
            pièce, tape sur « Modifier les détails », et ajoute
            l&apos;occasion que tu veux. Elle fera confiance à ton
            choix plutôt qu&apos;à son filtre par défaut — pratique
            quand ton lieu de travail est plus décontracté que la
            moyenne, ou quand une pièce semble décontractée mais te
            paraît bonne pour un événement précis.
          </p>
        </Q>
        <Q q="Je peux remplacer juste une pièce dans une suggestion ?">
          <p>
            Tape l&apos;icône shuffle sur n&apos;importe quelle pièce
            d&apos;une tenue suggérée et choisis une remplaçante dans ton
            dressing — le reste du look reste intact, et Linette réécrit
            ses notes de style autour de ton échange.
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
            Les photos sont stockées dans le stockage objet de Supabase,
            notre fournisseur de base de données. Les données de ton
            dressing sont protégées par la sécurité au niveau des lignes —
            seul ton compte connecté y a accès. Nous ne vendons pas tes
            données. Détails dans notre{" "}
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
            Linette est gratuit pendant la phase bêta. Pour garder les
            coûts raisonnables, les fonctions IA ont des limites
            quotidiennes — actuellement 3 suggestions de tenues, 3 essayages
            et 2 listes de bagages par jour. Les forfaits payants
            arriveront plus tard ; tu les verras dans l&apos;app bien avant
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
