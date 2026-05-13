// 기획서 4장: 운영 팀 현황 - 15개 팀 실제 데이터

export type Product = "감귤" | "딸기" | "배" | "토마토" | "포도" | "한우";

export interface SeedTeam {
  name: string;
  product: Product;
  cohort: string;
  courseName: string;
  region: string;
  headCount: number;
  totalSessions: number;
  endDate: string; // 2026-MM-DD
  professorName: string;
}

export const SEED_TEAMS: SeedTeam[] = [
  // 감귤 3
  { name: "귤생귤사",      product: "감귤", cohort: "4기",  courseName: "토양·병해충",    region: "제주 서귀포", headCount: 7,  totalSessions: 13, endDate: "2026-11-18", professorName: "현민수" },
  { name: "감귤국",        product: "감귤", cohort: "5기",  courseName: "노지 스마트",    region: "제주 서귀포", headCount: 6,  totalSessions: 22, endDate: "2026-11-09", professorName: "강태훈" },
  { name: "감귤 성장농",    product: "감귤", cohort: "6기",  courseName: "만감류 관리",    region: "제주 서귀포", headCount: 8,  totalSessions: 15, endDate: "2026-09-27", professorName: "오정민" },
  // 딸기 7
  { name: "딸기 다락방",    product: "딸기", cohort: "11기", courseName: "생육전체",       region: "전남 장성",   headCount: 7,  totalSessions: 14, endDate: "2026-11-10", professorName: "박상호" },
  { name: "딸기의 정석2",   product: "딸기", cohort: "15기", courseName: "스마트팜 온실", region: "충남 논산",   headCount: 6,  totalSessions: 13, endDate: "2026-06-16", professorName: "이재민" },
  { name: "혼디베리연구회", product: "딸기", cohort: "14기", courseName: "생육전체",       region: "제주 제주시", headCount: 5,  totalSessions: 8,  endDate: "2026-10-19", professorName: "고지혜" },
  { name: "밀양육묘",       product: "딸기", cohort: "육묘팀", courseName: "육묘–정식",     region: "경남 밀양",   headCount: 9,  totalSessions: 8,  endDate: "2026-10-30", professorName: "정수영" },
  { name: "진주딸기",       product: "딸기", cohort: "12기", courseName: "현장문제",       region: "경남 진주",   headCount: 11, totalSessions: 13, endDate: "2026-10-31", professorName: "한승호" },
  { name: "산청대박딸기",   product: "딸기", cohort: "13기", courseName: "현장문제",       region: "경남 산청",   headCount: 5,  totalSessions: 10, endDate: "2026-09-21", professorName: "한승호" },
  { name: "산청 청년딸기",  product: "딸기", cohort: "청년팀", courseName: "육묘–정식",     region: "경남 산청",   headCount: 5,  totalSessions: 9,  endDate: "2026-10-03", professorName: "정수영" },
  // 배 1
  { name: "배띄워라",       product: "배",   cohort: "2기",  courseName: "전주기 재배",    region: "전북 김제",   headCount: 7,  totalSessions: 10, endDate: "2026-10-10", professorName: "윤기철" },
  // 토마토 1
  { name: "Best방토",       product: "토마토", cohort: "7기", courseName: "스마트재배",    region: "전북 김제",   headCount: 8,  totalSessions: 19, endDate: "2026-11-04", professorName: "최영진" },
  // 포도 1
  { name: "안산명품포도",   product: "포도", cohort: "3기",  courseName: "스마트 영농",    region: "경기 안산",   headCount: 6,  totalSessions: 19, endDate: "2026-07-07", professorName: "신동훈" },
  // 한우 2
  { name: "우두머리",       product: "한우", cohort: "6기",  courseName: "사양관리·경영", region: "충북 청주",   headCount: 6,  totalSessions: 13, endDate: "2026-07-11", professorName: "임철민" },
  { name: "한우해움",       product: "한우", cohort: "7기",  courseName: "종합 경영",      region: "강원 인제",   headCount: 6,  totalSessions: 14, endDate: "2026-08-26", professorName: "김도경" },
];

export const PRODUCTS: Product[] = ["감귤", "딸기", "배", "토마토", "포도", "한우"];

export const PRODUCT_COLORS: Record<Product, string> = {
  감귤: "bg-orange-100 text-orange-800 border-orange-200",
  딸기: "bg-pink-100 text-pink-800 border-pink-200",
  배:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  토마토: "bg-red-100 text-red-800 border-red-200",
  포도: "bg-purple-100 text-purple-800 border-purple-200",
  한우: "bg-amber-100 text-amber-800 border-amber-200",
};
