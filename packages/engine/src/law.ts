export type LawId = "bkk-plan-2556" | "mr-33" | "mr-7" | "bma-2544" | "eia";

export type Law = {
  id: LawId;
  /** Short English name for inline citations. */
  short: string;
  titleEn: string;
  titleTh: string;
  url: string;
};

export const LAWS = {
  "bkk-plan-2556": {
    id: "bkk-plan-2556",
    short: "2013 plan",
    titleEn: "Ministerial Regulation enforcing the Bangkok Comprehensive Plan, B.E. 2556 (2013)",
    titleTh: "กฎกระทรวงให้ใช้บังคับผังเมืองรวมกรุงเทพมหานคร พ.ศ. ๒๕๕๖",
    url: "https://download.asa.or.th/03media/04law/cpa/mr56-bma.pdf",
  },
  "mr-33": {
    id: "mr-33",
    short: "MR 33",
    titleEn: "Ministerial Regulation No. 33 (1992) on high-rise and extra-large buildings",
    titleTh: "กฎกระทรวง ฉบับที่ ๓๓ (พ.ศ. ๒๕๓๕)",
    url: "https://download.asa.or.th/03media/04law/cba/mr/mr35-33-upd69.pdf",
  },
  "mr-7": {
    id: "mr-7",
    short: "MR 7",
    titleEn: "Ministerial Regulation No. 7 (1974) on car parking",
    titleTh: "กฎกระทรวง ฉบับที่ ๗ (พ.ศ. ๒๕๑๗)",
    url: "https://www.iibh.org/kijun/pdf/Thai_02_MRs.pdf",
  },
  "bma-2544": {
    id: "bma-2544",
    short: "BMA ordinance",
    titleEn: "Bangkok Building Control Ordinance, B.E. 2544 (2001)",
    titleTh: "ข้อบัญญัติกรุงเทพมหานคร เรื่อง ควบคุมอาคาร พ.ศ. ๒๕๔๔",
    url: "https://lawplayer.com/th/act/pythainlp_913eb25903dfb0d1",
  },
  eia: {
    id: "eia",
    short: "EIA notification",
    titleEn:
      "Ministry of Natural Resources and Environment notification on the projects that need an environmental impact assessment report",
    titleTh:
      "ประกาศกระทรวงทรัพยากรธรรมชาติและสิ่งแวดล้อม เรื่อง กำหนดประเภทและขนาดของโครงการหรือกิจการซึ่งต้องจัดทำรายงานการวิเคราะห์ผลกระทบสิ่งแวดล้อม",
    url: "https://www.onep.go.th/eia/",
  },
} as const satisfies Record<LawId, Law>;

/** Where a number comes from: a law and its clause, e.g. clause "17" or "50(1)". */
export type Citation = {
  law: LawId;
  clause: string;
};

/** "2013 plan, cl. 17" */
export function formatCitation(citation: Citation): string {
  return `${LAWS[citation.law].short}, cl. ${citation.clause}`;
}
