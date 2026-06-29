import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

/** Helper: invoke a trailing-callback arg with the result, or return as Promise. */
function cbOrPromise(args: unknown[], result: unknown): unknown {
  const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] as (r: unknown) => void : null;
  if (cb) { try { cb(result); } catch { /* swallow */ } return undefined; }
  return Promise.resolve(result);
}

export class ChromeFontSettings {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onMinimumFontSizeChanged: ChromeEvent = new ChromeEvent();
  public readonly onDefaultFixedFontSizeChanged: ChromeEvent = new ChromeEvent();
  public readonly onDefaultFontSizeChanged: ChromeEvent = new ChromeEvent();
  public readonly onFontChanged: ChromeEvent = new ChromeEvent();

  /**
   * `chrome.fontSettings.*` — read/write per-script font preferences.
   *
   * DDX has no global font-control surface, but we honor the
   * read-side getters by returning sensible defaults:
   *   - getFontList → `document.fonts` enumeration
   *   - getDefaultFontSize / getDefaultFixedFontSize / getMinimumFontSize
   *     → DDX defaults (16 / 13 / 0)
   *   - getFont → the manifest's default sans-serif
   *
   * Writers are no-ops (we don't propagate to a real Chrome font
   * subsystem). Extensions that just READ to display their UI
   * (e.g. dark-reader configuration pages) work correctly.
   */

  clearDefaultFixedFontSize(...args: any[]): any { return cbOrPromise(args, undefined); }
  clearDefaultFontSize(...args: any[]): any { return cbOrPromise(args, undefined); }
  clearFont(...args: any[]): any { return cbOrPromise(args, undefined); }
  clearMinimumFontSize(...args: any[]): any { return cbOrPromise(args, undefined); }

  getDefaultFixedFontSize(...args: any[]): any {
    return cbOrPromise(args, { pixelSize: 13, levelOfControl: 'controllable_by_this_extension' });
  }
  getDefaultFontSize(...args: any[]): any {
    return cbOrPromise(args, { pixelSize: 16, levelOfControl: 'controllable_by_this_extension' });
  }
  getFont(...args: any[]): any {
    return cbOrPromise(args, { fontId: 'sans-serif', levelOfControl: 'controllable_by_this_extension' });
  }
  getFontList(...args: any[]): any {
    let list: Array<{ fontId: string; displayName: string }> = [];
    try {
      const fonts = (document as { fonts?: { entries?: () => Iterable<{ family: string }> } }).fonts;
      const seen = new Set<string>();
      if (fonts && typeof fonts.entries === 'function') {
        for (const ff of fonts.entries()) {
          if (!seen.has(ff.family)) {
            seen.add(ff.family);
            list.push({ fontId: ff.family, displayName: ff.family });
          }
        }
      }
      // Always include the standard families as a baseline.
      for (const fam of ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy']) {
        if (!seen.has(fam)) list.push({ fontId: fam, displayName: fam });
      }
    } catch {
      list = [
        { fontId: 'sans-serif', displayName: 'Sans Serif' },
        { fontId: 'serif', displayName: 'Serif' },
        { fontId: 'monospace', displayName: 'Monospace' },
      ];
    }
    return cbOrPromise(args, list);
  }
  getMinimumFontSize(...args: any[]): any {
    return cbOrPromise(args, { pixelSize: 0, levelOfControl: 'controllable_by_this_extension' });
  }

  setDefaultFixedFontSize(...args: any[]): any { return cbOrPromise(args, undefined); }
  setDefaultFontSize(...args: any[]): any { return cbOrPromise(args, undefined); }
  setFont(...args: any[]): any { return cbOrPromise(args, undefined); }
  setMinimumFontSize(...args: any[]): any { return cbOrPromise(args, undefined); }

  static readonly GenericFamily = {
    CURSIVE: "cursive",
    FANTASY: "fantasy",
    FIXED: "fixed",
    MATH: "math",
    SANSSERIF: "sansserif",
    SERIF: "serif",
    STANDARD: "standard",
  } as const;

  static readonly LevelOfControl = {
    CONTROLLABLE_BY_THIS_EXTENSION: "controllable_by_this_extension",
    CONTROLLED_BY_OTHER_EXTENSIONS: "controlled_by_other_extensions",
    CONTROLLED_BY_THIS_EXTENSION: "controlled_by_this_extension",
    NOT_CONTROLLABLE: "not_controllable",
  } as const;

  static readonly ScriptCode = {
    AFAK: "Afak",
    ARAB: "Arab",
    ARMI: "Armi",
    ARMN: "Armn",
    AVST: "Avst",
    BALI: "Bali",
    BAMU: "Bamu",
    BASS: "Bass",
    BATK: "Batk",
    BENG: "Beng",
    BLIS: "Blis",
    BOPO: "Bopo",
    BRAH: "Brah",
    BRAI: "Brai",
    BUGI: "Bugi",
    BUHD: "Buhd",
    CAKM: "Cakm",
    CANS: "Cans",
    CARI: "Cari",
    CHAM: "Cham",
    CHER: "Cher",
    CIRT: "Cirt",
    COPT: "Copt",
    CPRT: "Cprt",
    CYRL: "Cyrl",
    CYRS: "Cyrs",
    DEVA: "Deva",
    DSRT: "Dsrt",
    DUPL: "Dupl",
    EGYD: "Egyd",
    EGYH: "Egyh",
    EGYP: "Egyp",
    ELBA: "Elba",
    ETHI: "Ethi",
    GEOK: "Geok",
    GEOR: "Geor",
    GLAG: "Glag",
    GOTH: "Goth",
    GRAN: "Gran",
    GREK: "Grek",
    GUJR: "Gujr",
    GURU: "Guru",
    HANG: "Hang",
    HANI: "Hani",
    HANO: "Hano",
    HANS: "Hans",
    HANT: "Hant",
    HEBR: "Hebr",
    HLUW: "Hluw",
    HMNG: "Hmng",
    HUNG: "Hung",
    INDS: "Inds",
    ITAL: "Ital",
    JAVA: "Java",
    JPAN: "Jpan",
    JURC: "Jurc",
    KALI: "Kali",
    KHAR: "Khar",
    KHMR: "Khmr",
    KHOJ: "Khoj",
    KNDA: "Knda",
    KPEL: "Kpel",
    KTHI: "Kthi",
    LANA: "Lana",
    LAOO: "Laoo",
    LATF: "Latf",
    LATG: "Latg",
    LATN: "Latn",
    LEPC: "Lepc",
    LIMB: "Limb",
    LINA: "Lina",
    LINB: "Linb",
    LISU: "Lisu",
    LOMA: "Loma",
    LYCI: "Lyci",
    LYDI: "Lydi",
    MAND: "Mand",
    MANI: "Mani",
    MAYA: "Maya",
    MEND: "Mend",
    MERC: "Merc",
    MERO: "Mero",
    MLYM: "Mlym",
    MONG: "Mong",
    MOON: "Moon",
    MROO: "Mroo",
    MTEI: "Mtei",
    MYMR: "Mymr",
    NARB: "Narb",
    NBAT: "Nbat",
    NKGB: "Nkgb",
    NKOO: "Nkoo",
    NSHU: "Nshu",
    OGAM: "Ogam",
    OLCK: "Olck",
    ORKH: "Orkh",
    ORYA: "Orya",
    OSMA: "Osma",
    PALM: "Palm",
    PERM: "Perm",
    PHAG: "Phag",
    PHLI: "Phli",
    PHLP: "Phlp",
    PHLV: "Phlv",
    PHNX: "Phnx",
    PLRD: "Plrd",
    PRTI: "Prti",
    RJNG: "Rjng",
    RORO: "Roro",
    RUNR: "Runr",
    SAMR: "Samr",
    SARA: "Sara",
    SARB: "Sarb",
    SAUR: "Saur",
    SGNW: "Sgnw",
    SHAW: "Shaw",
    SHRD: "Shrd",
    SIND: "Sind",
    SINH: "Sinh",
    SORA: "Sora",
    SUND: "Sund",
    SYLO: "Sylo",
    SYRC: "Syrc",
    SYRE: "Syre",
    SYRJ: "Syrj",
    SYRN: "Syrn",
    TAGB: "Tagb",
    TAKR: "Takr",
    TALE: "Tale",
    TALU: "Talu",
    TAML: "Taml",
    TANG: "Tang",
    TAVT: "Tavt",
    TELU: "Telu",
    TENG: "Teng",
    TFNG: "Tfng",
    TGLG: "Tglg",
    THAA: "Thaa",
    THAI: "Thai",
    TIBT: "Tibt",
    TIRH: "Tirh",
    UGAR: "Ugar",
    VAII: "Vaii",
    VISP: "Visp",
    WARA: "Wara",
    WOLE: "Wole",
    XPEO: "Xpeo",
    XSUX: "Xsux",
    YIII: "Yiii",
    ZMTH: "Zmth",
    ZSYM: "Zsym",
    ZYYY: "Zyyy",
  } as const;

}
