---
title: Evidence Model Whitepaper
version: "1.0"
effectiveDate: "[DATO VED LANSERING]"
product: OfferAccept
immutable: true
language: "no"
---

# OfferAccept — Bevismodell og hash-kjede

**Versjon 1.0**

---

## Formål

Dette dokumentet forklarer den tekniske bevismodellen i OfferAccept: hvilke data som lagres, hvordan de hashes, og hvordan tredjeparter kan verifisere et akseptsertifikat uavhengig av OfferAccept som mellomledd. Dokumentet er beregnet på juridiske rådgivere, tekniske integratorer og due diligence-gjennomganger.

---

## De fire uforanderlige tabellene

Tillitten i OfferAccept hviler på fire tabeller som er append-only — ingen del av applikasjonskoden utsteder `UPDATE` eller `DELETE` mot dem:

| Tabell | Innhold |
|---|---|
| `AcceptanceRecord` | Aksepthandlingen: verifisert e-post, erklæringstekst, tidsstempler, IP, nettleser |
| `OfferSnapshot` | Det frosne tilbudets innhold på sendingstidspunktet — uendret etter sending |
| `OfferSnapshotDocument` | SHA-256-hash per vedlegg på sendingstidspunktet |
| `SigningEvent` | Ordnet hendelseskjede: LINK_OPENED → OTP_ISSUED → OTP_VERIFIED → ACCEPTED |

Siden disse radene aldri endres, skal en hash beregnet i dag mot den levende databasen matche hashen beregnet på aksepttidspunktet — med mindre data har blitt manipulert.

---

## Hash-beregning trinn for trinn

### Steg 1 — Tilbudet fryses ved sending

Når et tilbud sendes, opprettes en `OfferSnapshot` med `contentHash`:

```
contentHash = SHA-256(canonical JSON av snapshot-feltene)
```

Eventuelle vedlagte dokumenter får hver sin `documentHash = SHA-256(filinnhold)`. Dokumenthashene inngår i snapshot-dataene og dermed i `contentHash`. En etterfølgende endring av et vedlegg er detekterbar fordi dokumenthashen ikke lenger stemmer.

### Steg 2 — Mottakeren aksepterer

Ved aksept bygges et `CertificatePayload` av alle felt fra `AcceptanceRecord`, `OfferSnapshot`, `OfferSnapshotDocument[]` og `OfferRecipient`. Deretter beregnes `certificateHash`:

```javascript
function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object).sort()
        .map(k => [k, deepSortKeys((value as Record<string,unknown>)[k])])
    );
  }
  return value;
}

const canonical = JSON.stringify(deepSortKeys(payload));
certificateHash = SHA-256(canonical, encoding='utf-8') // lowercase hex
```

Reglene er presise:
- Alle nøkler sorteres alfabetisk — rekursivt på alle nivåer
- Arrays beholder elementrekkefølge — dokumenter sorteres etter `storageKey` før payload bygges
- Ingen whitespace i serialiseringen
- `null`-verdier inkluderes — utelates aldri
- UTF-8-encoding

### Steg 3 — Canonical hash (lett fingeravtrykk)

I tillegg til `certificateHash` lagres en `canonicalHash` — et kompakt femfelts fingeravtrykk av selve aksepthandlingen:

```javascript
SHA-256( JSON.stringify(deepSortKeys({
  acceptedAt,
  dealId,
  ipAddress,
  recipientEmail,
  userAgent
})) )
```

En tredjepart som kun har disse fem verdiene kan verifisere aksepten uten tilgang til det fulle sertifikatet eller autentisert API-tilgang.

---

## Verifisering — tre nivåer

### Nivå 1 — Offentlig verifisering (ingen autentisering)

`GET /certificates/:id/verify` returnerer:

```json
{
  "valid": true,
  "certificateHashMatch": true,
  "reconstructedHash": "a3f2...",
  "storedHash": "a3f2...",
  "snapshotIntegrity": true,
  "eventChainIntegrity": true,
  "anomaliesDetected": []
}
```

Endepunktet re-spør de immutable tabellene, reberegner hash fra bunnen av, og sammenligner med lagret hash. Responsen eksponerer kun hashes og booleans — ingen personopplysninger.

### Nivå 2 — Uavhengig lokal verifisering

1. Kall `GET /certificates/:id/export` (krever autentisering som organisasjonsmedlem)
2. Motta `payload` og `canonicalJson`
3. Beregn `SHA-256(canonicalJson)` lokalt
4. Sammenlign med `certificateHash` i responsen

Ingen avhengighet av OfferAccepts beregningslogikk.

### Nivå 3 — Full rekonstruksjon fra rådata

En part med direkte databasetilgang kan rekonstruere `certificateHash` fra bunnen ved å hente radene, kjøre `deepSortKeys`, serialisere og hashe. Hashspesifikasjonen er tilgjengelig på `/docs/certificate-hash-spec` med referanseimplementasjoner i JavaScript og Python.

---

## Hendelseskjede-validering

`CertificateService.verify()` validerer den ordnede hendelseskjeden ved hvert verifiseringskall:

```
LINK_OPENED  →  OTP_ISSUED  →  OTP_VERIFIED  →  ACCEPTED
```

Sjekkes:
- `LINK_OPENED` eksisterer og er tidligst
- `OTP_ISSUED` etter `LINK_OPENED`
- `OTP_VERIFIED` etter `OTP_ISSUED`
- `ACCEPTED` etter `OTP_VERIFIED`
- Ingen ugyldige tilstandsoverganger

Aksept uten forutgående `OTP_VERIFIED` flagges som `ANOMALY` i verifikasjonsresponsen.

---

## Juridiske dokumentversjoner i sertifikatresponsen

Hvert verifiserings- og eksportsvar fra API-et inneholder en `metadata`-seksjon som identifiserer de juridiske dokumentene som gjaldt på tidspunktet for avtalen:

```json
{
  "metadata": {
    "termsVersionAtCreation":     "1.1",
    "acceptanceStatementVersion": "1.1",
    "evidenceModelVersion":       "1.0"
  }
}
```

### Kilderegeler (kanoniske verdier)

| Felt | Kilde | Tidspunkt for lagring |
|---|---|---|
| `termsVersionAtCreation` | `Offer.termsVersionAtCreation` | Lagres når deal opprettes — uforanderlig etter opprettelse |
| `acceptanceStatementVersion` | `AcceptanceRecord.acceptanceStatementVersion` | Lagres ved aksepttidspunktet — uforanderlig som del av akseptbeviset |
| `evidenceModelVersion` | Statisk konstant i `CertificateService` | Identifiserer gjeldende hash-algoritme og hendelseskjedespesifikasjon |

**Viktig:** Disse feltene er *utenfor* det hashede `CertificatePayload`-objektet. De påvirker ikke eksisterende sertifikathashes — som er et krav for bakoverkompatibilitet. De er tillitslagannoteringer som returneres ved siden av integritetsresultatet.

Når `termsVersionAtCreation` eller `acceptanceStatementVersion` er `null`, betyr det at avtalen eller akseptposten ble opprettet før disse feltene ble introdusert (migrasjonen `20260412_legal_acceptance`). Integritetskontrollen er ikke svekket — kun versjonssporing er utilgjengelig for disse eldre postene.

Den fulle teksten til de juridiske dokumentene er tilgjengelig på:
- `/legal/terms/v{termsVersionAtCreation}` — Vilkår for bruk på tidspunktet for avtaleinngåelse
- `/legal/acceptance-statement` — Aksepterklæringen som ble vist mottakeren
- `/security/evidence-model` — Dette dokumentet (gjeldende versjon)

---

## Hva bevismodellen beviser — og ikke beviser

### Beviser

- En e-postadresse som mottok signeringslinken mottok og oppga en gyldig OTP
- OTP-verifisering fant sted før aksepthandlingen i hendelseskjeden
- Aksepten ble foretatt mot et spesifikt fryst tilbudsinnhold (ved `contentHash`)
- Erklæringsteksten mottakeren så er nøyaktig den teksten som er lagret i sertifikatet
- Ingen modifikasjon av noe bevisfeltet har funnet sted siden utstedelse — forutsatt hash-match

### Beviser ikke

- At den navngitte personen fysisk kontrollerte enheten — kun at noen med tilgang til e-postkontoen gjennomførte aksepten
- At mottakeren leste eller forstod dokumentinnholdet
- At aksepten oppfyller kravene til et bindende rettsforhold i en bestemt jurisdiksjon
- Identitet utover «kontroll over e-postinnboksen på OTP-verifiseringstidspunktet»

---

## Kontakt

| Formål | E-post |
|---|---|
| Spørsmål om bevismodellen | legal@offeraccept.com |
| Tekniske spørsmål | security@offeraccept.com |
