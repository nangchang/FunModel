// 규격 가구: 한국에서 흔한 규격·대표 치수(어림). 데이터만 두고 생성기(model.js KINDS)로 만든다. params는 각 생성기 fields의 범위 안이어야 한다
// 침대(bed)의 W·D는 프레임 전체이고 매트리스는 W−40 × D−90이라, 매트리스 규격 + 40 × 2000 + 90으로 적는다
const C = { ply: '#d8b98b', oak: '#b88a5b', walnut: '#6b4a34', white: '#f0eee8', gray: '#9aa1a8', black: '#2d3035', fabric: '#7f909e', linen: '#ece8de', metal: '#c8cdd2', rug: '#c5b59f' }; // model.js COLORS와 같은 값
export const CATS = ['침대', '소파·의자', '테이블·책상', '수납', '가전', '기타'];
const bed = (name, w) => ({ cat: '침대', name, kind: 'bed', params: { W: w + 40, D: 2090 } });
const sofa = (name, W) => ({ cat: '소파·의자', name, kind: 'sofa', params: { W } });
const table = (name, W, D, H, o = {}) => ({ cat: '테이블·책상', name, kind: 'table', params: { W, D, H, ...o } });
const wardrobe = (W, doors) => ({ cat: '수납', name: `옷장 ${W}`, kind: 'cabinet', params: { W, D: 600, H: 2200, shelves: 1, doors, C: C.white, C2: C.white } });
const box = (cat, name, W, D, H, color) => ({ cat, name, kind: 'box', params: { W, D, H, C: color } });
const appl = (name, W, D, H, color = C.white) => box('가전', name, W, D, H, color);

export const CATALOG = [
  bed('싱글 침대', 1000), bed('슈퍼싱글 침대', 1100), bed('더블 침대', 1400), bed('퀸 침대 (1500)', 1500), bed('킹 침대', 1600), bed('라지킹 침대', 1800),
  sofa('1인 소파', 900), sofa('2인 소파', 1500), sofa('3인 소파', 2100), sofa('4인 소파', 2700),
  { cat: '소파·의자', name: '식탁 의자', kind: 'chair', params: { W: 450, D: 480, H: 850 } },
  { cat: '소파·의자', name: '사무용 의자', kind: 'chair', params: { W: 650, D: 650, H: 1100, seat: 470, C: C.black, C2: C.black } },
  box('소파·의자', '스툴', 350, 350, 450, C.oak),
  table('2인 식탁', 800, 700, 750), table('4인 식탁', 1200, 800, 750), table('6인 식탁', 1800, 900, 750, { top: 30, leg: 70, inset: 60, apron: 80, C: C.walnut, C2: C.walnut }),
  table('책상 1200', 1200, 600, 730), table('책상 1400', 1400, 700, 730), table('책상 1600', 1600, 800, 730), table('책상 1800', 1800, 800, 730),
  table('거실 테이블', 1000, 500, 400, { leg: 40 }), table('화장대', 800, 400, 750, { C: C.white, C2: C.white }),
  wardrobe(800, 2), wardrobe(1000, 2), wardrobe(1200, 2), wardrobe(1600, 4),
  { cat: '수납', name: '책장', kind: 'cabinet', params: { W: 800, D: 300, H: 1800, shelves: 4, C: C.white } },
  { cat: '수납', name: '낮은 책장', kind: 'cabinet', params: { W: 800, D: 300, H: 1100, shelves: 2, C: C.white } },
  { cat: '수납', name: '3단 서랍장', kind: 'drawers', params: { W: 800, D: 450, H: 700, rows: 3 } },
  { cat: '수납', name: '5단 서랍장', kind: 'drawers', params: { W: 800, D: 450, H: 1100, rows: 5 } },
  { cat: '수납', name: '협탁', kind: 'drawers', params: { W: 450, D: 400, H: 500, rows: 2, plinth: 0 } },
  { cat: '수납', name: '신발장', kind: 'cabinet', params: { W: 900, D: 350, H: 1100, shelves: 4, doors: 2, C: C.white } },
  { cat: '수납', name: 'TV장 2000', kind: 'cabinet', params: { W: 2000, D: 400, H: 450, shelves: 0, doors: 4, plinth: 0, C: C.white, C2: C.oak } },
  appl('양문형 냉장고', 910, 930, 1790, C.metal), appl('일반 냉장고', 600, 700, 1700, C.metal), appl('김치냉장고 (스탠드)', 700, 800, 1800, C.metal), appl('김치냉장고 (뚜껑)', 900, 650, 850),
  appl('드럼 세탁기', 700, 800, 1000), appl('통돌이 세탁기', 650, 700, 1050), appl('건조기', 700, 800, 1000), appl('식기세척기', 600, 600, 850),
  appl('스탠드 에어컨', 400, 400, 1800), appl('TV 55인치 (스탠드)', 1230, 250, 780, C.black), appl('TV 65인치 (스탠드)', 1450, 300, 900, C.black), appl('TV 75인치 (스탠드)', 1680, 350, 1030, C.black),
  box('기타', '업라이트 피아노', 1500, 600, 1250, C.walnut), box('기타', '행거', 1200, 500, 1800, C.metal),
  box('기타', '러그 1400×2000', 1400, 2000, 10, C.rug), box('기타', '러그 1600×2300', 1600, 2300, 10, C.rug), box('기타', '러그 2000×3000', 2000, 3000, 10, C.rug),
];
