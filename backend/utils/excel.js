const ExcelJS = require('exceljs');

/** Stream an .xlsx file from a sheet definition to the response. */
async function streamXlsx(res, filename, sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Karyo Guest Palace';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { streamXlsx };
