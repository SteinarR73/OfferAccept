import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vilkår for bruk — OfferAccept',
  description:
    'OfferAccept Terms of Service (v1.1). Describes what OfferAccept does and does not do, customer obligations, acceptance statement, liability, and governing law.',
};

// ─── Layout helper ────────────────────────────────────────────────────────────

function LegalPageShell({
  title,
  version,
  effectiveLabel,
  children,
}: {
  title: string;
  version: string;
  effectiveLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <span className="w-7 h-7 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold">
              OA
            </span>
            OfferAccept
          </Link>
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Tilbake
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
          <p className="text-sm text-gray-500">
            Versjon {version} · {effectiveLabel}
          </p>
        </div>
        <div className="prose prose-sm prose-gray max-w-none leading-relaxed">
          {children}
        </div>
      </main>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      title="Vilkår for bruk"
      version="1.1"
      effectiveLabel="Gjelder fra lansering"
    >
      <section>
        <h2>1. Partene og avtalens omfang</h2>
        <p>
          Disse vilkårene («Vilkårene») er en bindende avtale mellom OfferAccept («vi», «oss»,
          «tjenesten») og den organisasjonen eller personen som oppretter en konto og benytter
          tjenesten («Kunden»). Vilkårene gjelder for all bruk av OfferAccept-plattformen,
          inkludert nettsted, API og tilhørende tjenester.
        </p>
        <p>
          Ved å opprette en konto bekrefter Kunden å ha lest, forstått og akseptert disse
          vilkårene. Dersom du inngår avtalen på vegne av en organisasjon, bekrefter du at du
          har fullmakt til å binde organisasjonen juridisk.
        </p>
      </section>

      <section>
        <h2>2. Hva OfferAccept er – og hva det ikke er</h2>
        <h3>2.1 Hva tjenesten gjør</h3>
        <p>OfferAccept er et SaaS-verktøy som gjør det mulig for Kunden å:</p>
        <ul>
          <li>Sende tilbudsdokumenter digitalt til navngitte mottakere</li>
          <li>
            Verifisere at mottakeren kontrollerer den angitte e-postadressen via
            engangspassord (OTP)
          </li>
          <li>Registrere aksept eller avvisning med en manipuleringssikker bevislogg</li>
          <li>
            Generere et sertifikat med SHA-256-fingeravtrykk som dokumentasjon på
            aksepthandlingen
          </li>
        </ul>

        <h3>2.2 Hva tjenesten ikke gjør</h3>
        <p>OfferAccept tilbyr ikke:</p>
        <ul>
          <li>
            <strong>Kvalifisert elektronisk signatur (QES)</strong> i henhold til
            eIDAS-forordningen. OfferAccept er ikke et kvalifisert tillitstjenestetilbyder
            (QTSP).
          </li>
          <li>
            <strong>Personidentitetsverifisering.</strong> OTP-verifisering bekrefter at
            mottakeren kontrollerer den angitte e-postadressen på aksepttidspunktet – ikke hvem
            personen er.
          </li>
          <li>
            <strong>Juridisk rådgivning.</strong> OfferAccept er ikke et advokatfirma og gir
            ingen juridisk rådgivning.
          </li>
          <li>
            Tjenester for regulerte instrumenter som verdipapirer, fast eiendom, testamenter,
            fullmakter eller dokumenttyper som etter gjeldende lov krever notarisering, vitner
            eller sterkere identitetsprøving.
          </li>
          <li>
            <strong>Kontroll over dokumentinnholdet.</strong> OfferAccept har ingen kontroll
            over eller ansvar for innholdet i dokumenter som sendes gjennom tjenesten. Kunden er
            fullt ansvarlig for innholdet i tilbud, avtaler og andre dokumenter som distribueres
            via plattformen.
          </li>
        </ul>
        <p>
          Kunden er selv ansvarlig for å vurdere om OfferAccept er juridisk tilstrekkelig for
          det aktuelle brukstilfellet i sin jurisdiksjon.
        </p>
      </section>

      <section>
        <h2>3. Kundens forpliktelser</h2>
        <h3>3.1 Lovlig bruk</h3>
        <p>
          Kunden forplikter seg til utelukkende å benytte tjenesten til lovlige formål og ikke
          til:
        </p>
        <ul>
          <li>Sende villedende, bedragersk eller tvangsmessig materiale til mottakere</li>
          <li>Bruke tjenesten til dokumenttyper som er uttrykkelig unntatt i punkt 2.2</li>
          <li>
            Forsøke å omgå, manipulere eller misbruke plattformens sikkerhetskontroller
          </li>
          <li>Sende volum-spam eller uønskede kommersielle henvendelser til mottakere</li>
        </ul>

        <h3>3.2 Ansvar for mottakeridentitet</h3>
        <p>
          Kunden er ansvarlig for å invitere riktig mottaker til akseptflyten. OfferAccept
          verifiserer kun kontroll over den angitte e-postadressen, ikke identiteten til
          personen som bruker adressen. Dersom Kunden sender en akseptinvitasjon til feil
          e-postadresse, er dette utelukkende Kundens ansvar.
        </p>

        <h3>3.3 Nøyaktighet av data</h3>
        <p>
          Kunden er ansvarlig for at navn, e-postadresse og øvrig mottakerinformasjon er
          korrekt oppgitt. Feil i mottakerdata fritar ikke Kunden for ansvar overfor sin
          mottaker.
        </p>

        <h3>3.4 Personvernansvarlighet</h3>
        <p>
          Kunden er behandlingsansvarlig i henhold til GDPR for personopplysningene som
          behandles gjennom tjenesten. OfferAccept opptrer som databehandler i henhold til
          inngått databehandleravtale (DPA). Kunden er ansvarlig for å ha et gyldig
          behandlingsgrunnlag for behandling av mottakernes personopplysninger.
        </p>
      </section>

      <section>
        <h2>4. Aksepterklæring og beviskraft</h2>
        <h3>4.1 Ordlyd</h3>
        <p>
          Aksepterklæringen som vises til mottakeren og lagres i sertifikatet er
          serverside-generert og har følgende form:
        </p>
        <blockquote>
          <em>
            «I, [Mottakers navn], confirm that I have reviewed and accept the offer
            &quot;[Tilbudstittel]&quot; presented by [Avsenders navn] ([Avsenders e-post]).
            By confirming this acceptance, I acknowledge this action as my binding agreement
            to the terms presented.»
          </em>
        </blockquote>
        <p>
          Se{' '}
          <Link href="/legal/acceptance-statement" className="text-blue-600 hover:text-blue-700">
            Aksepterklæring — teknisk og juridisk spesifikasjon
          </Link>{' '}
          for detaljert beskrivelse av ordlyd, teknisk integritet og eIDAS-posisjonering.
        </p>

        <h3>4.2 Bevisverdi</h3>
        <p>
          Akseptsertifikatet dokumenterer at en OTP-verifisert e-postadresse aktivt aksepterte
          et fryst tilbud på et spesifikt tidspunkt. OfferAccept garanterer ikke at sertifikatet
          vil bli ansett som tilstrekkelig bevis i enhver rettslig tvist. Bevisverdien avhenger
          av gjeldende rett i den aktuelle jurisdiksjonen.
        </p>
      </section>

      <section>
        <h2>5. Betaling og abonnement</h2>
        <p>
          Tjenesten leveres etter gjeldende prisplan på tidspunktet for bestilling.
          Abonnementet fornyes automatisk med mindre det avsluttes før fornyelsesdato. Alle
          priser er eksklusiv merverdiavgift der dette er aktuelt. Fakturering skjer via Stripe.
        </p>
      </section>

      <section>
        <h2>6. Tilgjengelighet og driftsstans</h2>
        <p>
          OfferAccept tilstreber høy oppetid, men gir ingen garanti for avbruddfri tilgang.
          Planlagte vedlikeholdsarbeider varsles på statussiden. Uplanlagte avbrudd annonseres
          så raskt som mulig.
        </p>
      </section>

      <section>
        <h2>7. Force majeure</h2>
        <p>
          OfferAccept er ikke ansvarlig for forsinkelser eller manglende oppfyllelse som
          skyldes forhold utenfor vår rimelige kontroll, inkludert men ikke begrenset til
          naturkatastrofer, strømbrudd, nettverksfeil, myndighetspålegg, angrep fra tredjeparter
          eller svikt hos underleverandører.
        </p>
      </section>

      <section>
        <h2>8. Immaterielle rettigheter</h2>
        <p>
          OfferAccept eier alle rettigheter til plattformen, kode, design og merkevare. Kunden
          eier sine egne data, inkludert tilbudsdokumenter og akseptposter. OfferAccept gis
          begrenset lisens til å behandle disse dataene utelukkende for å levere tjenesten.
        </p>
      </section>

      <section>
        <h2>9. Ansvarsbegrensning</h2>
        <p>I den grad det er tillatt etter gjeldende rett:</p>
        <ul>
          <li>
            OfferAccept fungerer som en nøytral teknisk plattform og er ikke part i avtaler
            inngått mellom Kunden og mottakeren. Alle rettigheter og forpliktelser som følger
            av aksepterte tilbud er utelukkende mellom Kunden og mottakeren.
          </li>
          <li>
            OfferAccepts samlede erstatningsansvar overfor Kunden er begrenset til det beløp
            Kunden har betalt for tjenesten i de 12 månedene forut for kravet.
          </li>
          <li>
            OfferAccept er ikke ansvarlig for indirekte tap, tapt fortjeneste eller
            følgeskader.
          </li>
          <li>
            OfferAccept er ikke ansvarlig for innholdet i dokumenter som Kunden sender via
            tjenesten.
          </li>
          <li>
            OfferAccept er ikke ansvarlig for at et akseptsertifikat ikke anerkjennes som
            tilstrekkelig bevis av en domstol eller myndighet.
          </li>
          <li>
            OfferAccept er ikke ansvarlig for konsekvenser av at Kunden har oppgitt feil
            mottakerinformasjon.
          </li>
        </ul>
      </section>

      <section>
        <h2>10. Oppsigelse</h2>
        <p>
          Kunden kan når som helst avslutte abonnementet. OfferAccept kan avslutte eller
          suspendere tilgangen med 30 dagers skriftlig varsel, eller umiddelbart ved vesentlig
          mislighold av disse vilkårene.
        </p>
      </section>

      <section>
        <h2>11. Verneting og lovvalg</h2>
        <p>
          Disse vilkårene er underlagt norsk rett. Tvister som ikke løses i minnelighet
          bringes inn for kompetent norsk tingrett som vedtatt verneting. For kunder etablert i
          EU gjelder ufravikelig EU-forbrukervernlovgivning i tillegg til disse vilkårene der
          dette er relevant.
        </p>
      </section>

      <section>
        <h2>12. Endringer</h2>
        <p>
          OfferAccept kan endre disse vilkårene med 30 dagers skriftlig varsel. Fortsatt bruk
          etter varslingsperioden anses som aksept av de endrede vilkårene.
        </p>
      </section>

      <section>
        <h2>13. Kontakt</h2>
        <ul>
          <li>
            Juridiske henvendelser:{' '}
            <a href="mailto:legal@offeraccept.com" className="text-blue-600 hover:text-blue-700">
              legal@offeraccept.com
            </a>
          </li>
          <li>
            Personvernhenvendelser:{' '}
            <a
              href="mailto:privacy@offeraccept.com"
              className="text-blue-600 hover:text-blue-700"
            >
              privacy@offeraccept.com
            </a>
          </li>
          <li>
            Sikkerhet:{' '}
            <a
              href="mailto:security@offeraccept.com"
              className="text-blue-600 hover:text-blue-700"
            >
              security@offeraccept.com
            </a>
          </li>
        </ul>
      </section>

      <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400">
        Dette er den kanoniske versjonen av Vilkår for bruk v1.1. Stabile URL:{' '}
        <Link href="/legal/terms/v1.1" className="underline hover:text-gray-600">
          /legal/terms/v1.1
        </Link>
      </div>
    </LegalPageShell>
  );
}
