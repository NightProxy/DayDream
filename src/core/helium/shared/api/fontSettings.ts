import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeFontSettings {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onMinimumFontSizeChanged: ChromeEvent = new ChromeEvent();
  public readonly onDefaultFixedFontSizeChanged: ChromeEvent = new ChromeEvent();
  public readonly onDefaultFontSizeChanged: ChromeEvent = new ChromeEvent();
  public readonly onFontChanged: ChromeEvent = new ChromeEvent();

  clearDefaultFixedFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.clearDefaultFixedFontSize is not implemented');
  }

  clearDefaultFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.clearDefaultFontSize is not implemented');
  }

  clearFont(..._args: any[]): any {
    throw new Error('chrome.fontSettings.clearFont is not implemented');
  }

  clearMinimumFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.clearMinimumFontSize is not implemented');
  }

  getDefaultFixedFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.getDefaultFixedFontSize is not implemented');
  }

  getDefaultFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.getDefaultFontSize is not implemented');
  }

  getFont(..._args: any[]): any {
    throw new Error('chrome.fontSettings.getFont is not implemented');
  }

  getFontList(..._args: any[]): any {
    throw new Error('chrome.fontSettings.getFontList is not implemented');
  }

  getMinimumFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.getMinimumFontSize is not implemented');
  }

  setDefaultFixedFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.setDefaultFixedFontSize is not implemented');
  }

  setDefaultFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.setDefaultFontSize is not implemented');
  }

  setFont(..._args: any[]): any {
    throw new Error('chrome.fontSettings.setFont is not implemented');
  }

  setMinimumFontSize(..._args: any[]): any {
    throw new Error('chrome.fontSettings.setMinimumFontSize is not implemented');
  }

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
