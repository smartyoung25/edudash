import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("C:/Users/IIamHub2/Documents/네이트온 받은 파일/2026년 맞춤형과정 주간보고_이암허브.xlsx");
const names = [];
wb.eachSheet((ws) => names.push(`${ws.name}(rows=${ws.rowCount})`));
console.log(names.join("\n"));
