// Animal portraits drawn in code (2026-09-23): flat, simple, 100x100 SVG. Crude on purpose -- Frank
// asked for approximations that are cheap to extend. Each species has a handful of "looks" (dog
// breeds, color patterns for the rest); built-in characters use one (Hayley and Koba were drawn
// from Frank's photos), and people pick one for their own animals. Pure strings, so the same art
// renders in the UI (as an <img> data URI) and on share cards (drawn onto a canvas).
//
// Look ids per species must match LOOKS in server/src/custom.ts, which turns them into the words
// the prompt uses ("a golden retriever").

export type Species = "cat" | "dog" | "cow" | "duck" | "parrot" | "fish" | "horse" | "goat" | "snake";

type Colors = Record<string, string>;
type LookDef = { id: string; label: string; colors: Colors; variant?: string };

const EYE_SHINE = `fill="#fff" opacity=".85"`;

// Mirror a shape drawn on the left half onto the right.
const mirror = (inner: string) => `${inner}<g transform="translate(100 0) scale(-1 1)">${inner}</g>`;

function cat(c: Colors, variant = "tabby"): string {
  const stripes =
    variant === "tabby"
      ? `<g stroke="${c.stripe}" stroke-width="2.6" stroke-linecap="round" fill="none">
           <path d="M44 31 L45 41"/><path d="M50 29 L50 41"/><path d="M56 31 L55 41"/>
           ${mirror(`<path d="M21 55 Q27 54 31 56"/><path d="M22 61 Q27 60 31 61"/>`)}
         </g>`
      : "";
  const patches =
    variant === "tuxedo"
      ? `<path d="M50 50 C40 58 36 70 42 80 L58 80 C64 70 60 58 50 50 Z" fill="${c.white}"/>`
      : variant === "calico"
        ? `<ellipse cx="36" cy="44" rx="11" ry="10" fill="${c.patch1}"/><ellipse cx="64" cy="40" rx="10" ry="9" fill="${c.patch2}"/>
           <path d="M66 18 L74 13 L72 30 Z" fill="${c.patch2}"/>`
        : "";
  return `
    ${mirror(`<path d="M21 46 L27 12 L47 29 Z" fill="${c.fur}"/><path d="M26 39 L29 20 L41 31 Z" fill="${c.innerEar}"/>`)}
    <ellipse cx="50" cy="55" rx="31" ry="26" fill="${c.fur}"/>
    <ellipse cx="50" cy="65" rx="26" ry="17" fill="${c.fur}"/>
    ${patches}${stripes}
    ${mirror(`<ellipse cx="45" cy="67" rx="7" ry="5" fill="${c.muzzle}"/>`)}
    ${mirror(`<ellipse cx="38" cy="52" rx="6.6" ry="5.6" fill="${c.eye}"/><ellipse cx="38" cy="52" rx="1.5" ry="4.8" fill="#15131a"/><circle cx="36.3" cy="50.3" r="1.2" ${EYE_SHINE}/>`)}
    <path d="M46.2 61.5 Q50 60.3 53.8 61.5 L50.7 65.6 Q50 66.2 49.3 65.6 Z" fill="${c.nose}"/>
    <path d="M50 66 Q47.5 70 44.5 68.5 M50 66 Q52.5 70 55.5 68.5" stroke="#3a2f2f" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    ${mirror(`<g stroke="${c.whisker}" stroke-width=".8" opacity=".75" stroke-linecap="round"><path d="M40 67 L19 64"/><path d="M40 69.5 L20 71"/></g>`)}`;
}

function dog(c: Colors, variant: string): string {
  const eyes = (cx: number, cy: number, r: number) =>
    mirror(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.eye}"/><circle cx="${cx - r * 0.3}" cy="${cy - r * 0.35}" r="${r * 0.3}" ${EYE_SHINE}/>`);
  switch (variant) {
    case "boxer":
      // Koba: brown coat, black mask over a broad square muzzle, white chin and lips, dark folded ears.
      return `
        ${mirror(`<path d="M28 30 C18 26 12 36 16 50 C19 56 25 52 27 44 Z" fill="${c.ear}"/>`)}
        <path d="M50 16 C70 16 78 30 78 46 C78 62 70 72 50 74 C30 72 22 62 22 46 C22 30 30 16 50 16 Z" fill="${c.fur}"/>
        <path d="M44 24 Q50 27 56 24 M45 29 Q50 31 55 29" stroke="${c.wrinkle}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path d="M31 58 C31 46 40 42 50 42 C60 42 69 46 69 58 C69 72 61 80 50 80 C39 80 31 72 31 58 Z" fill="${c.mask}"/>
        ${eyes(38, 45, 4.4)}
        <path d="M34 68 C38 76 44 80 50 80 C56 80 62 76 66 68 C62 72 57 74 50 74 C43 74 38 72 34 68 Z" fill="${c.white}"/>
        <path d="M42 77 Q50 82 58 77 Q50 85 42 77 Z" fill="${c.lip}"/>
        <ellipse cx="50" cy="55" rx="8" ry="5.2" fill="#101012"/><ellipse cx="47.5" cy="53.8" rx="2" ry="1.1" fill="#fff" opacity=".35"/>
        <path d="M50 60 L50 66" stroke="#101012" stroke-width="1.4"/>`;
    case "golden":
    case "lab": {
      const longEars = variant === "golden";
      return `
        ${mirror(
          longEars
            ? `<path d="M30 28 C16 30 12 50 16 68 C19 76 28 74 30 64 C32 52 33 40 30 28 Z" fill="${c.ear}"/>`
            : `<path d="M30 28 C19 28 15 42 18 56 C20 62 27 60 29 52 C31 44 32 36 30 28 Z" fill="${c.ear}"/>`,
        )}
        <path d="M50 18 C68 18 76 32 76 48 C76 64 68 72 50 72 C32 72 24 64 24 48 C24 32 32 18 50 18 Z" fill="${c.fur}"/>
        <ellipse cx="50" cy="64" rx="15" ry="12" fill="${c.muzzle}"/>
        ${eyes(39, 46, 3.8)}
        <ellipse cx="50" cy="58" rx="6.2" ry="4.2" fill="#161416"/><ellipse cx="48.2" cy="57" rx="1.6" ry=".9" fill="#fff" opacity=".35"/>
        <path d="M50 62 L50 66 M50 66 Q46 70 42 67 M50 66 Q54 70 58 67" stroke="#2a2224" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M46 69 Q50 77 54 69 Z" fill="#e8798b"/>`;
    }
    case "chihuahua":
      // Peanut: small fawn head, enormous upright ears, huge glossy eyes, tiny pointed muzzle.
      return `
        ${mirror(`<path d="M34 38 L12 10 L24 50 Z" fill="${c.fur}"/><path d="M31 38 L16 17 L25 45 Z" fill="${c.innerEar}"/>`)}
        <ellipse cx="50" cy="52" rx="23" ry="21" fill="${c.fur}"/>
        <ellipse cx="50" cy="64" rx="10" ry="9" fill="${c.muzzle}"/>
        ${mirror(`<circle cx="40" cy="50" r="6" fill="${c.eye}"/><circle cx="38.2" cy="48.2" r="2" ${EYE_SHINE}/>`)}
        <ellipse cx="50" cy="61" rx="3.6" ry="2.6" fill="#1a1618"/>
        <path d="M50 63.5 Q48 66.5 46 65.5 M50 63.5 Q52 66.5 54 65.5" stroke="#2a2224" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
    default:
      // mutt: white with a brown patch over one eye, one ear up and one down, tongue out.
      return `
        <path d="M31 30 C20 30 16 44 19 58 C21 64 28 62 30 54 C32 46 33 38 31 30 Z" fill="${c.patch}"/>
        <path d="M61 30 L74 5 L79 34 Z" fill="${c.patch}"/>
        <path d="M50 18 C68 18 76 32 76 48 C76 64 68 72 50 72 C32 72 24 64 24 48 C24 32 32 18 50 18 Z" fill="${c.fur}"/>
        <ellipse cx="61" cy="44" rx="11" ry="10" fill="${c.patch}"/>
        <ellipse cx="50" cy="64" rx="15" ry="12" fill="${c.muzzle}"/>
        ${eyes(39, 46, 3.8)}
        <ellipse cx="50" cy="58" rx="6" ry="4" fill="#161416"/>
        <path d="M50 62 L50 66 M50 66 Q46 70 42 67 M50 66 Q54 70 58 67" stroke="#2a2224" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        <path d="M46 68 C46 78 54 78 54 68 Z" fill="#e8798b"/>`;
  }
}

function cow(c: Colors, variant: string): string {
  const horns =
    variant === "highland"
      ? mirror(`<path d="M34 28 C24 26 14 20 10 10 C18 16 26 18 36 22 Z" fill="${c.horn}"/>`)
      : mirror(`<path d="M36 24 C33 18 34 13 38 11 C38 16 39 19 41 22 Z" fill="${c.horn}"/>`);
  const spots =
    variant === "holstein"
      ? `<path d="M30 30 C38 26 44 34 40 42 C36 50 26 46 27 38 Z" fill="${c.spot}"/>
         <path d="M58 22 C66 20 72 26 68 32 C64 36 56 32 58 22 Z" fill="${c.spot}"/>
         <path d="M62 44 C68 42 72 48 68 52 C64 55 60 50 62 44 Z" fill="${c.spot}"/>`
      : "";
  const fringe =
    variant === "highland"
      ? `<path d="M28 30 L33 44 L37 32 L42 46 L46 33 L50 47 L54 33 L58 46 L63 32 L67 44 L72 30 C66 22 34 22 28 30 Z" fill="${c.fringe}"/>`
      : "";
  return `
    ${horns}
    ${mirror(`<ellipse cx="20" cy="40" rx="11" ry="5.5" transform="rotate(-18 20 40)" fill="${c.fur}"/><ellipse cx="21" cy="40" rx="6.5" ry="3" transform="rotate(-18 21 40)" fill="${c.innerEar}"/>`)}
    <path d="M50 18 C64 18 70 28 70 44 C70 58 66 66 66 72 L34 72 C34 66 30 58 30 44 C30 28 36 18 50 18 Z" fill="${c.fur}"/>
    ${spots}
    ${variant === "highland" ? "" : mirror(`<circle cx="39" cy="44" r="3.4" fill="#1c1a1c"/><circle cx="38" cy="43" r="1" ${EYE_SHINE}/>`)}
    ${fringe}
    <ellipse cx="50" cy="72" rx="19" ry="12" fill="${c.muzzle}"/>
    ${variant === "jersey" ? `<ellipse cx="50" cy="72" rx="19" ry="12" fill="none" stroke="${c.ring}" stroke-width="3"/>` : ""}
    ${mirror(`<ellipse cx="43" cy="72" rx="3" ry="4" fill="${c.nostril}"/>`)}
    <path d="M44 79 Q50 82 56 79" stroke="${c.nostril}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
}

function duck(c: Colors): string {
  // Three-quarter view: round head, bill to the left, one eye.
  return `
    <path d="M26 100 C24 78 36 68 54 68 C72 68 82 80 80 100 Z" fill="${c.chest}"/>
    ${c.ring ? `<path d="M34 72 C44 66 64 66 74 72" stroke="${c.ring}" stroke-width="4" fill="none" stroke-linecap="round"/>` : ""}
    <circle cx="55" cy="45" r="25" fill="${c.head}"/>
    <path d="M36 50 C28 48 16 50 12 55 C14 60 26 61 37 58 Z" fill="${c.bill}"/>
    <path d="M14 56 C22 57 30 56 37 55" stroke="${c.billLine}" stroke-width="1" fill="none"/>
    <circle cx="50" cy="40" r="3.6" fill="#141216"/><circle cx="49" cy="39" r="1.1" ${EYE_SHINE}/>
    ${c.streak ? `<path d="M40 38 C48 36 58 36 70 40" stroke="${c.streak}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>` : ""}`;
}

function parrot(c: Colors, variant: string): string {
  const crest =
    variant === "cockatiel"
      ? `<path d="M54 22 C52 12 56 4 62 2 C58 10 60 16 62 22 Z" fill="${c.crest}"/><path d="M58 22 C60 14 66 8 72 8 C66 12 64 18 64 24 Z" fill="${c.crest}"/>`
      : "";
  return `
    <path d="M30 100 C28 76 40 64 58 64 C76 64 84 78 82 100 Z" fill="${c.body}"/>
    ${c.wing ? `<path d="M62 74 C76 74 82 88 80 100 L62 100 Z" fill="${c.wing}"/>` : ""}
    ${c.tail ? `<path d="M70 92 L82 100 L66 100 Z" fill="${c.tail}"/>` : ""}
    ${crest}
    <circle cx="58" cy="44" r="23" fill="${c.head}"/>
    <ellipse cx="48" cy="44" rx="11" ry="10" fill="${c.face}"/>
    ${c.cheek ? `<circle cx="52" cy="54" r="5.5" fill="${c.cheek}"/>` : ""}
    <path d="M40 40 C30 38 26 46 28 54 C29 58 33 58 35 54 C36 50 38 48 42 48 Z" fill="${c.beak}"/>
    <path d="M34 50 C36 52 40 52 42 49" stroke="${c.beakLine}" stroke-width="1" fill="none"/>
    <circle cx="50" cy="40" r="3.4" fill="#141216"/><circle cx="49" cy="39" r="1" ${EYE_SHINE}/>
    <circle cx="50" cy="40" r="5.2" fill="none" stroke="${c.eyeRing}" stroke-width="1.2" opacity=".7"/>`;
}

function fish(c: Colors, variant: string): string {
  const tail =
    variant === "betta"
      ? `<path d="M68 50 C80 30 96 26 98 40 C92 46 92 54 98 60 C96 74 80 70 68 50 Z" fill="${c.fin}"/>`
      : `<path d="M70 50 L90 34 C86 44 86 56 90 66 Z" fill="${c.fin}"/>`;
  const topFin =
    variant === "betta"
      ? `<path d="M38 34 C44 18 62 16 66 30 Z" fill="${c.fin}"/><path d="M40 66 C46 82 60 84 64 70 Z" fill="${c.fin}"/>`
      : `<path d="M40 35 C46 26 56 26 62 36 Z" fill="${c.fin}"/>`;
  return `
    ${tail}${topFin}
    <ellipse cx="46" cy="50" rx="28" ry="17" fill="${c.body}"/>
    <ellipse cx="44" cy="56" rx="20" ry="8" fill="${c.belly}"/>
    ${c.marking ? `<path d="M40 38 C52 36 62 44 60 52 C56 46 48 44 40 46 Z" fill="${c.marking}"/>` : ""}
    <path d="M36 42 C40 48 40 54 36 58" stroke="${c.gill}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".6"/>
    <circle cx="28" cy="46" r="4" fill="#fff"/><circle cx="27.5" cy="46" r="2.4" fill="#141216"/>
    <path d="M19 52 Q21 54 23 52" stroke="#3a2a2a" stroke-width="1" fill="none"/>
    <circle cx="14" cy="34" r="2.6" fill="none" stroke="#bfe3ff" stroke-width="1" opacity=".7"/>
    <circle cx="10" cy="24" r="1.8" fill="none" stroke="#bfe3ff" stroke-width="1" opacity=".6"/>`;
}

function horse(c: Colors, variant: string): string {
  return `
    ${mirror(`<path d="M37 22 L34 4 L44 16 Z" fill="${c.coat}"/><path d="M37.5 18 L36 9 L41.5 16 Z" fill="${c.innerEar}"/>`)}
    <path d="M50 14 C62 14 67 22 67 34 C67 50 64 62 64 76 C64 88 58 94 50 94 C42 94 36 88 36 76 C36 62 33 50 33 34 C33 22 38 14 50 14 Z" fill="${c.coat}"/>
    ${c.dapple ? `<g fill="${c.dapple}" opacity=".55"><circle cx="42" cy="36" r="3"/><circle cx="56" cy="32" r="2.4"/><circle cx="58" cy="46" r="2.8"/><circle cx="44" cy="52" r="2.2"/></g>` : ""}
    <path d="M40 12 C44 20 50 22 54 30 C50 24 46 22 42 24 C44 20 42 16 40 12 Z" fill="${c.mane}"/>
    ${variant === "bay" || variant === "black" ? `<path d="M50 30 L53 34 L50 38 L47 34 Z" fill="#f4f1ea"/>` : ""}
    ${variant === "chestnut" ? `<path d="M48 28 C49 44 49 60 47 74 L53 74 C51 60 51 44 52 28 Z" fill="#f4f1ea"/>` : ""}
    ${mirror(`<circle cx="38" cy="42" r="3.4" fill="#141216"/><circle cx="37" cy="41" r="1" ${EYE_SHINE}/>`)}
    <ellipse cx="50" cy="82" rx="14" ry="10" fill="${c.muzzle}"/>
    ${mirror(`<ellipse cx="44" cy="82" rx="2.4" ry="3.2" fill="#1a1618"/>`)}
    <path d="M45 89 Q50 91 55 89" stroke="#1a1618" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
}

function goat(c: Colors, variant: string): string {
  // The horizontal pupils are the point.
  return `
    ${mirror(`<path d="M42 24 C38 12 30 6 22 8 C30 10 34 16 36 26 Z" fill="${c.horn}"/>`)}
    ${mirror(`<ellipse cx="22" cy="40" rx="13" ry="5" transform="rotate(12 22 40)" fill="${c.ear}"/>`)}
    <path d="M50 18 C62 18 68 26 68 38 C68 52 62 62 60 74 C58 82 54 86 50 86 C46 86 42 82 40 74 C38 62 32 52 32 38 C32 26 38 18 50 18 Z" fill="${c.fur}"/>
    ${variant === "blackwhite" ? mirror(`<path d="M44 24 C44 40 44 60 46 80 L48 80 C47 60 47 40 47 24 Z" fill="${c.stripe}"/>`) : ""}
    ${mirror(`<ellipse cx="39" cy="42" rx="5.4" ry="4.4" fill="${c.eye}"/><rect x="35.8" y="41" width="6.4" height="2" rx="1" fill="#141216"/>`)}
    <ellipse cx="50" cy="74" rx="9" ry="7" fill="${c.muzzle}"/>
    ${mirror(`<ellipse cx="46.5" cy="73" rx="1.4" ry="2" fill="#2a2224"/>`)}
    <path d="M44 80 C46 92 50 98 50 98 C50 98 54 92 56 80 Z" fill="${c.beard}"/>`;
}

function snake(c: Colors, variant: string): string {
  const blotches =
    variant === "corn"
      ? `<g fill="${c.blotch}" stroke="${c.blotchEdge}" stroke-width="1.2"><ellipse cx="30" cy="76" rx="6" ry="4"/><ellipse cx="54" cy="84" rx="6" ry="4"/><ellipse cx="74" cy="72" rx="5" ry="4"/><ellipse cx="46" cy="40" rx="4" ry="3"/></g>`
      : variant === "striped"
        ? `<g stroke="${c.stripe}" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M18 78 C30 90 70 92 84 76"/><path d="M50 58 C50 50 48 44 46 38"/></g>`
        : "";
  return `
    <path d="M14 78 C14 62 40 60 50 64 C62 68 86 62 86 76 C86 94 58 96 50 94 C40 92 14 94 14 78 Z" fill="${c.body}"/>
    <path d="M22 80 C30 86 70 88 80 78" stroke="${c.belly}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M44 66 C42 56 42 46 46 36 L56 36 C58 46 58 56 56 66 Z" fill="${c.body}"/>
    ${blotches}
    <ellipse cx="51" cy="30" rx="15" ry="11" fill="${c.body}"/>
    ${variant === "black" ? `<ellipse cx="46" cy="26" rx="5" ry="2" fill="#fff" opacity=".2"/>` : ""}
    ${mirror(`<circle cx="45" cy="28" r="2.8" fill="${c.eye}"/><rect x="44.4" y="26" width="1.2" height="4" rx=".6" fill="#141216"/>`)}
    <path d="M51 41 L51 47 L48 51 M51 47 L54 51" stroke="#d8394a" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
}

const DRAW: Record<Species, (c: Colors, variant: string) => string> = { cat, dog, cow, duck, parrot, fish, horse, goat, snake };

export const LOOKS: Record<Species, LookDef[]> = {
  cat: [
    // Hayley, from Frank's photo: gray-brown tabby, green eyes.
    { id: "gray-tabby", label: "gray tabby", variant: "tabby", colors: { fur: "#8d8579", stripe: "#4d463e", innerEar: "#d9a9a0", muzzle: "#a8a092", eye: "#9cbf6b", nose: "#b77f74", whisker: "#e8e4dc" } },
    { id: "orange-tabby", label: "orange tabby", variant: "tabby", colors: { fur: "#e0913f", stripe: "#ad5f1d", innerEar: "#f0b6a4", muzzle: "#eeb070", eye: "#e8c14a", nose: "#d9776e", whisker: "#fff3e4" } },
    { id: "black", label: "black", variant: "solid", colors: { fur: "#2b2a33", innerEar: "#5a4450", muzzle: "#34333d", eye: "#e8d15a", nose: "#4a3a42", whisker: "#bdbac6" } },
    { id: "tuxedo", label: "tuxedo", variant: "tuxedo", colors: { fur: "#2b2a33", white: "#f4f2ee", innerEar: "#5a4450", muzzle: "#f4f2ee", eye: "#9cc46a", nose: "#e3a3a3", whisker: "#d9d6de" } },
    { id: "calico", label: "calico", variant: "calico", colors: { fur: "#f4f0e8", patch1: "#e0913f", patch2: "#2b2a33", innerEar: "#f0b6a4", muzzle: "#fbf8f2", eye: "#e8c14a", nose: "#e39a93", whisker: "#b8b2a8" } },
  ],
  dog: [
    // Koba, from Frank's photo: brown boxer, black mask, white chin, dark folded ears.
    { id: "boxer", label: "boxer", variant: "boxer", colors: { fur: "#b06a35", ear: "#6e3d1c", wrinkle: "#7a4320", mask: "#2a2322", white: "#efe6de", lip: "#e3a3a3", eye: "#3a2216" } },
    { id: "golden", label: "golden retriever", variant: "golden", colors: { fur: "#dba44f", ear: "#c28a38", muzzle: "#efcf95", eye: "#3a2216" } },
    { id: "lab", label: "black lab", variant: "lab", colors: { fur: "#2d2b30", ear: "#222025", muzzle: "#3b3940", eye: "#6b4428" } },
    { id: "chihuahua", label: "chihuahua", variant: "chihuahua", colors: { fur: "#d9ad76", innerEar: "#f0c6b0", muzzle: "#ecd1a8", eye: "#221816" } },
    { id: "mutt", label: "mutt", variant: "mutt", colors: { fur: "#f1ece4", patch: "#8a5a36", muzzle: "#faf6f0", eye: "#3a2216" } },
  ],
  cow: [
    { id: "holstein", label: "holstein", variant: "holstein", colors: { fur: "#f4f2ee", spot: "#1f1d21", innerEar: "#f0b8b0", horn: "#d8cdb6", muzzle: "#f1b8b0", nostril: "#9a5a58" } },
    { id: "jersey", label: "jersey", variant: "jersey", colors: { fur: "#c8955a", innerEar: "#e8c09a", horn: "#e2d8c4", muzzle: "#3a2a22", ring: "#e8d9c4", nostril: "#140e0c" } },
    { id: "highland", label: "highland", variant: "highland", colors: { fur: "#b0643a", fringe: "#c77446", innerEar: "#d99a74", horn: "#ece2cc", muzzle: "#3a2622", nostril: "#140e0c" } },
  ],
  duck: [
    { id: "mallard", label: "mallard", colors: { head: "#1f6f4a", bill: "#e3c341", billLine: "#9c8420", chest: "#7a4a32", ring: "#f4f2ee" } },
    { id: "white", label: "white", colors: { head: "#f4f1ea", bill: "#f0993a", billLine: "#b86a20", chest: "#ebe6dc" } },
    { id: "brown", label: "brown", colors: { head: "#9a7650", bill: "#d88a3a", billLine: "#8e5a24", chest: "#8a6644", streak: "#4e3a26" } },
  ],
  parrot: [
    { id: "african-grey", label: "African grey", colors: { head: "#9aa0a6", face: "#dfe2e5", body: "#8b9197", beak: "#262528", beakLine: "#5a585c", eyeRing: "#f4f4f4", tail: "#d8322b" } },
    { id: "macaw", label: "scarlet macaw", colors: { head: "#d8322b", face: "#f6f1ea", body: "#c92c26", wing: "#2f6fd8", beak: "#efe6d6", beakLine: "#1e1c1e", eyeRing: "#e8c14a", tail: "#e8c14a" } },
    { id: "cockatiel", label: "cockatiel", variant: "cockatiel", colors: { head: "#f2d45c", face: "#f6e29a", body: "#8b9197", crest: "#f2d45c", cheek: "#ea7a3a", beak: "#cfc2b0", beakLine: "#8a7e6e", eyeRing: "#6b6a6e" } },
  ],
  fish: [
    { id: "goldfish", label: "goldfish", colors: { body: "#f08a2c", belly: "#f8b56a", fin: "#f4a04a", gill: "#b05a14" } },
    { id: "tang", label: "blue tang", colors: { body: "#2f6fd8", belly: "#4f8ae4", fin: "#f2d43a", marking: "#10204a", gill: "#10204a" } },
    { id: "betta", label: "betta", variant: "betta", colors: { body: "#9a2f6a", belly: "#b8457e", fin: "#c9407a", gill: "#5a1a3a" } },
  ],
  horse: [
    { id: "bay", label: "bay", variant: "bay", colors: { coat: "#8a5230", mane: "#1e1a1c", innerEar: "#5a331c", muzzle: "#3a2a22" } },
    { id: "chestnut", label: "chestnut", variant: "chestnut", colors: { coat: "#b0582a", mane: "#8e4420", innerEar: "#7a3a1a", muzzle: "#8a4a2c" } },
    { id: "gray", label: "dapple gray", variant: "gray", colors: { coat: "#c9cbcf", mane: "#8a8c92", innerEar: "#9a9ca2", muzzle: "#5a5a60", dapple: "#9a9ca4" } },
    { id: "palomino", label: "palomino", variant: "palomino", colors: { coat: "#e2b25a", mane: "#f4efe2", innerEar: "#c49240", muzzle: "#caa26a" } },
    { id: "black", label: "black", variant: "black", colors: { coat: "#2a2628", mane: "#141214", innerEar: "#1e1a1c", muzzle: "#3a3436" } },
  ],
  goat: [
    { id: "white", label: "white", variant: "white", colors: { fur: "#f1eee6", ear: "#e4d8c4", horn: "#cbb89a", eye: "#d9b44a", muzzle: "#e8c9bc", beard: "#e2ddd2" } },
    { id: "brown", label: "brown", variant: "brown", colors: { fur: "#9a6a42", ear: "#7e5434", horn: "#5a4a3a", eye: "#e2b84a", muzzle: "#b88a64", beard: "#6e4a2e" } },
    { id: "blackwhite", label: "black and white", variant: "blackwhite", colors: { fur: "#2b2a2e", stripe: "#f1eee6", ear: "#222125", horn: "#8a8078", eye: "#e2b84a", muzzle: "#f1eee6", beard: "#2b2a2e" } },
  ],
  snake: [
    { id: "corn", label: "corn snake", variant: "corn", colors: { body: "#e0703a", belly: "#f2c08a", blotch: "#b8321f", blotchEdge: "#5a1a10", eye: "#e8c14a" } },
    { id: "green", label: "green", variant: "green", colors: { body: "#4a9a4c", belly: "#b8d98a", eye: "#e8d15a" } },
    { id: "black", label: "black", variant: "black", colors: { body: "#26252b", belly: "#3a3942", eye: "#c9c4d6" } },
    { id: "striped", label: "garter", variant: "striped", colors: { body: "#2f3d2c", belly: "#5a6a3a", stripe: "#e8d15a", eye: "#e8c14a" } },
  ],
};

export function defaultLook(species: Species): string {
  return LOOKS[species][0]!.id;
}

export function lookLabel(species: Species, look: string | undefined): string {
  return (LOOKS[species].find((l) => l.id === look) ?? LOOKS[species][0]!).label;
}

/** The portrait as an SVG string, optionally on a filled circle. */
export function avatarSvg(species: Species, look?: string, background?: string): string {
  const def = LOOKS[species].find((l) => l.id === look) ?? LOOKS[species][0]!;
  const art = DRAW[species](def.colors, def.variant ?? def.id);
  const bg = background ? `<circle cx="50" cy="50" r="50" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>${bg}<g clip-path="url(#c)">${art}</g></svg>`;
}

// A background for the circle behind a portrait: the animal's accent, dimmed toward the app's dark
// surface -- light enough that black coats still read, dark enough to sit in the UI.
export function avatarBackground(accent: string): string {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = hex(accent);
  const [br, bg, bb] = hex("#20202a");
  const mix = (a: number, d: number) => Math.round(d + (a - d) * 0.55);
  return `#${[mix(r!, br!), mix(g!, bg!), mix(b!, bb!)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const uriCache = new Map<string, string>();

/** Data URI for an <img>, cached per species/look/background. */
export function avatarUri(species: Species, look?: string, background?: string): string {
  const key = `${species}|${look ?? ""}|${background ?? ""}`;
  let uri = uriCache.get(key);
  if (!uri) {
    uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(species, look, background))}`;
    uriCache.set(key, uri);
  }
  return uri;
}
