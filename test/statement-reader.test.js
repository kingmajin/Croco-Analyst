const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const XLSX = require("xlsx")

const { readStatement } = require("../statement-reader.js")

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "croco-test-"))
test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

function writeSheet(name, rows, origin) {
    const sheet = XLSX.utils.aoa_to_sheet(rows, origin ? { origin } : undefined)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, "Statement")
    const file = path.join(tempDir, name)
    XLSX.writeFile(workbook, file)
    return file
}

const statement = [
    ["My Bank"],
    [],
    ["Date", "Narration ", " Withdrawal", "Deposit"],
    ["15/01/2024", "UPI/1/SWIGGY", "100", ""],
    ["16/01/2024", "UPI/2/ZOMATO", "200", ""],
    [],
    ["Statement summary"]
]

test("reads till the first blank row and trims headers", () => {
    const file = writeSheet("till-end.xlsx", statement)
    const result = readStatement(file, 3, -1)

    assert.deepEqual(result.headers, ["Date", "Narration", "Withdrawal", "Deposit"])
    assert.equal(result.records.length, 2)
    assert.equal(result.records[1].Narration, "UPI/2/ZOMATO")
})

test("reads a fixed row range", () => {
    const file = writeSheet("range.xlsx", statement)
    const result = readStatement(file, "3", "4")

    assert.equal(result.records.length, 1)
    assert.equal(result.records[0].Withdrawal, "100")
})

test("row numbers match Excel when the sheet does not start at row 1", () => {
    const file = writeSheet("offset.xlsx", statement.slice(2, 5), "A3")
    const result = readStatement(file, 3, -1)

    assert.deepEqual(result.headers, ["Date", "Narration", "Withdrawal", "Deposit"])
    assert.equal(result.records.length, 2)
})

test("an empty header row gives an error", () => {
    const file = writeSheet("blank-header.xlsx", statement)
    assert.match(readStatement(file, 2, -1).error, /Row 2/)
    assert.match(readStatement(file, 50, -1).error, /Row 50/)
})

test("a missing or broken file gives an error instead of throwing", () => {
    assert.match(readStatement(path.join(tempDir, "nope.xlsx"), 1, -1).error, /Could not read the file/)

    const broken = path.join(tempDir, "broken.xlsx")
    fs.writeFileSync(broken, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]))
    assert.ok(readStatement(broken, 1, -1).error)
})
