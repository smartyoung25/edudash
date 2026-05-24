import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("C:/Users/IIamHub2/Documents/네이트온 받은 파일/2026년 맞춤형과정 주간보고_이암허브.xlsx");
for (const ws of wb.worksheets) {
  console.log("=== Sheet:", ws.name, "rowCount=" + ws.rowCount, "colCount=" + ws.columnCount);
  ws.eachRow({ includeEmpty: false }, (row, i) => {
    if (i <= 15) {
      const vals = row.values.slice(1).map((v) => (v && typeof v === "object" && v.text ? v.text : v));
      console.log(" R" + i, JSON.stringify(vals).slice(0, 400));
    }
  });
}
