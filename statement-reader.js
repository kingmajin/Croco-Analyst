const XLSX = require('xlsx');

const isBlankRow = (row) => !row || row.every(cell => cell == null || String(cell).trim() === "");

// Reads the first sheet between fromRow and toRow (1-based Excel rows, fromRow is the header row).
// toRow -1 means "till the first blank row".
// Returns { headers, records } or { error } with a message that can be shown to the user.
function readStatement(filePath, fromRow, toRow) {
  try {
    const workbook = XLSX.readFile(filePath);

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet || !sheet['!ref']) {
      return { error: "The first sheet of this file is empty." };
    }

    // sheet_to_json starts at the first used row, pad it so data[i] is always Excel row i + 1
    const firstUsedRow = XLSX.utils.decode_range(sheet['!ref']).s.r;
    const data = Array.from({ length: firstUsedRow }, () => [])
      .concat(XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true }));

    fromRow = Number(fromRow);
    toRow = Number(toRow);

    const headerIndex = fromRow - 1;
    if (!Number.isInteger(fromRow) || fromRow < 1 || headerIndex >= data.length || isBlankRow(data[headerIndex])) {
      return { error: `Row ${fromRow} of the sheet is empty, so it can't be used as the header row. Check "From Row" in the format.` };
    }

    let endIndex = toRow;
    if (toRow == -1) {
      endIndex = headerIndex;
      while (endIndex < data.length && !isBlankRow(data[endIndex])) {
        endIndex++;
      }
    }

    const headers = Array.from(data[headerIndex], header => String(header ?? "").trim());
    const rows = data.slice(headerIndex + 1, endIndex);

    const records = rows.map(row => {
      let obj = {};
      headers.forEach((key, index) => {
        if (key !== "") obj[key] = row?.[index];
      });
      return obj;
    });

    return { headers: headers.filter(Boolean), records };
  } catch (err) {
    return { error: `Could not read the file: ${err.message}` };
  }
}

module.exports = { readStatement };
