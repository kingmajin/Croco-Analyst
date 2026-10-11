const test = require("node:test")
const assert = require("node:assert/strict")

const categoryMap = require("../data.js")
const {
    UNCATEGORIZED,
    normalizeDate,
    parseAmount,
    buildCategoryMatchers,
    categorize,
    escapeHtml,
    findMissingColumns,
    buildTransactions,
    dailyTotals,
    monthlyTotals,
    weekdayTotals,
    categoryTotals,
    summarize
} = require("../analysis.js")

const matchers = buildCategoryMatchers(categoryMap)

const row = (TranDate, Debit = 0, Credit = 0, extra = {}) => ({ TranDate, Debit, Credit, ...extra })

test("normalizeDate reads day-first text dates with any separator", () => {
    assert.equal(normalizeDate("15/01/2024"), "2024-01-15")
    assert.equal(normalizeDate("15-01-2024"), "2024-01-15")
    assert.equal(normalizeDate("15.01.2024"), "2024-01-15")
    assert.equal(normalizeDate("5/1/24"), "2024-01-05")
    assert.equal(normalizeDate("15 Jan 2024"), "2024-01-15")
    assert.equal(normalizeDate("15-Sept-2024"), "2024-09-15")
    assert.equal(normalizeDate(" 01/02/2024 10:32:05 "), "2024-02-01")
    assert.equal(normalizeDate("2024-01-15"), "2024-01-15")
})

test("normalizeDate reads Excel serial dates without a timezone shift", () => {
    assert.equal(normalizeDate(45306), "2024-01-15")
    assert.equal(normalizeDate(45306.75), "2024-01-15")
})

test("normalizeDate rejects things that are not dates", () => {
    assert.equal(normalizeDate(undefined), null)
    assert.equal(normalizeDate(""), null)
    assert.equal(normalizeDate("Opening Balance"), null)
    assert.equal(normalizeDate("31/02/2024"), null)
    assert.equal(normalizeDate("15/13/2024"), null)
    assert.equal(normalizeDate("15/01/202"), null)
    assert.equal(normalizeDate("15 Foo 2024"), null)
})

test("parseAmount handles commas, currency and suffixes", () => {
    assert.equal(parseAmount(1234.56), 1234.56)
    assert.equal(parseAmount("1,234.56"), 1234.56)
    assert.equal(parseAmount("1,23,456.00"), 123456)
    assert.equal(parseAmount("Rs. 1,234.56"), 1234.56)
    assert.equal(parseAmount("Rs.500"), 500)
    assert.equal(parseAmount("₹ 99"), 99)
    assert.equal(parseAmount("12,345.00 Cr"), 12345)
    assert.equal(parseAmount("-250"), -250)
    assert.equal(parseAmount(""), 0)
    assert.equal(parseAmount("-"), 0)
    assert.equal(parseAmount(undefined), 0)
    assert.equal(parseAmount(NaN), 0)
})

test("categorize does not match short keywords inside other words", () => {
    assert.equal(categorize("RAVI KUMAR", matchers), UNCATEGORIZED)        // "vi"
    assert.equal(categorize("ACME PAYROLL", matchers), UNCATEGORIZED)      // "roll"
    assert.equal(categorize("NEFT CREDITED", matchers), "Finance")         // not "red" (Travel)
    assert.equal(categorize("VI PREPAID", matchers), "Bills")
    assert.equal(categorize("OLA CABS", matchers), "Transportation")
})

test("categorize finds long keywords inside words and prefers the longest", () => {
    assert.equal(categorize("SWIGGY8@YBL", matchers), "Food / Snacks")
    assert.equal(categorize("INDIAN OIL CORP", matchers), "Fuel")
    assert.equal(categorize("GOOGLE PLAY STORE", matchers), "Entertainment")
    assert.equal(categorize("IRCTC", matchers), "Transportation")
})

test("categorize matches mixed case keywords and ignores apostrophes", () => {
    assert.equal(categorize("BIGBASKET", matchers), "Grocery")
    assert.equal(categorize("INDIGO AIRLINES", matchers), "Travel")
    assert.equal(categorize("MCDONALDS", matchers), "Food / Snacks")
})

test("escapeHtml escapes markup", () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    assert.equal(escapeHtml(undefined), "")
    assert.equal(escapeHtml(42), "42")
})

const splitFormat = {
    TranDate: "Date",
    TranDetail: "Narration",
    Debit: "Withdrawal",
    Credit: "Deposit",
    Balance: "Balance",
    ChequeNo: "",
    IsSplitTran: "true",
    Seperator: "/",
    TranNoIndex: "3",
    TranSourceIndex: "4"
}

test("findMissingColumns lists mapped headers the statement lacks", () => {
    assert.deepEqual(findMissingColumns(["Date", "Narration", "Withdrawal", "Deposit", "Balance"], splitFormat), [])
    assert.deepEqual(findMissingColumns(["Date", "Narration"], splitFormat), ["Withdrawal", "Deposit", "Balance"])
    assert.deepEqual(findMissingColumns(["Date", "Narration", "Withdrawal", "Deposit", "Balance"], { ...splitFormat, Debit: " Withdrawal " }), [])
})

test("buildTransactions maps, splits, tags, skips bad rows and orders oldest first", () => {
    const records = [
        { Date: "16/01/2024", Narration: "UPI/DR/1002/SWIGGY", Withdrawal: "1,250.50", Deposit: "", Balance: "8,749.50" },
        { Date: "", Narration: "continued narration", Withdrawal: "", Deposit: "", Balance: "" },
        { Date: undefined, Narration: undefined, Withdrawal: undefined, Deposit: undefined, Balance: undefined },
        { Date: "15/01/2024", Narration: "UPI/CR/1001/RAVI KUMAR", Withdrawal: "", Deposit: "10,000.00", Balance: "10,000.00" }
    ]

    const { transactions, skipped } = buildTransactions(records, splitFormat, { "RAVI KUMAR": "Friend" }, matchers)

    assert.equal(skipped, 1)
    assert.equal(transactions.length, 2)
    assert.deepEqual(transactions.map(t => t.TranDate), ["2024-01-15", "2024-01-16"])

    const [credit, debit] = transactions
    assert.equal(credit.Credit, 10000)
    assert.equal(credit.TranNo, "1001")
    assert.equal(credit.TranSource, "RAVI KUMAR")
    assert.equal(credit.SrcTag, "Friend")
    assert.equal(credit.Category, UNCATEGORIZED)
    assert.equal(debit.Debit, 1250.5)
    assert.equal(debit.Balance, 8749.5)
    assert.equal(debit.Category, "Food / Snacks")
    assert.equal(debit.SrcTag, "")
})

test("buildTransactions without splitting categorizes on the full detail", () => {
    const format = { ...splitFormat, IsSplitTran: "false" }
    const { transactions } = buildTransactions(
        [{ Date: "15/01/2024", Narration: "POS ZOMATO ORDER", Withdrawal: "300", Deposit: "", Balance: "" }],
        format, {}, matchers)

    assert.equal(transactions[0].Category, "Food / Snacks")
    assert.equal(transactions[0].TranSource, "")
    assert.equal(transactions[0].SrcTag, "")
})

test("buildTransactions keeps same-day order for newest-first statements", () => {
    const records = [
        { Date: "16/01/2024", Narration: "c", Withdrawal: "1", Balance: "7" },
        { Date: "15/01/2024", Narration: "b", Withdrawal: "1", Balance: "8" },
        { Date: "15/01/2024", Narration: "a", Withdrawal: "1", Balance: "9" }
    ]
    const { transactions } = buildTransactions(records, { ...splitFormat, IsSplitTran: "false" }, {}, matchers)

    assert.deepEqual(transactions.map(t => t.TranDetail), ["a", "b", "c"])
    assert.equal(transactions[transactions.length - 1].Balance, 7)
})

test("dailyTotals keeps every day, including the one before a single last transaction", () => {
    const rows = [row("2024-01-01", 10), row("2024-01-01", 5), row("2024-01-02", 7), row("2023-12-31", 99)]

    assert.deepEqual(dailyTotals(rows, "2024-01"), [
        { key: "01", debit: 15, credit: 0 },
        { key: "02", debit: 7, credit: 0 }
    ])
})

test("monthlyTotals groups one year by month in order", () => {
    const rows = [row("2024-03-05", 1), row("2024-01-10", 2, 3), row("2024-01-20", 4), row("2024-02-01", 0, 5), row("2023-01-01", 50)]

    assert.deepEqual(monthlyTotals(rows, "2024"), [
        { key: "01", debit: 6, credit: 3 },
        { key: "02", debit: 0, credit: 5 },
        { key: "03", debit: 1, credit: 0 }
    ])
})

test("weekdayTotals uses the calendar day", () => {
    // 2024-01-15 was a Monday
    const totals = weekdayTotals([row("2024-01-15", 10), row("2024-01-21", 3)])

    assert.equal(totals.length, 7)
    assert.equal(totals[1].key, "Monday")
    assert.equal(totals[1].debit, 10)
    assert.equal(totals[0].key, "Sunday")
    assert.equal(totals[0].debit, 3)
})

test("categoryTotals includes uncategorized spending", () => {
    const totals = categoryTotals(
        [row("2024-01-01", 10, 0, { Category: "Fuel" }), row("2024-01-01", 4, 0, { Category: UNCATEGORIZED })],
        ["Fuel", "Bills", UNCATEGORIZED])

    assert.deepEqual(totals.map(t => [t.key, t.debit]), [["Fuel", 10], ["Bills", 0], [UNCATEGORIZED, 4]])
})

test("summarize counts unique days and months whatever the row order", () => {
    const rows = [row("2024-02-01", 30), row("2024-01-15", 10, 100), row("2024-01-15", 20), row("2024-01-16", 0, 50)]
    const summary = summarize(rows)

    assert.equal(summary.totalDebit, 60)
    assert.equal(summary.totalCredit, 150)
    assert.equal(summary.averageDaily, 20)      // 60 over 3 days
    assert.equal(summary.averageMonthly, 30)    // 60 over 2 months
})

test("summarize of no rows is all zero", () => {
    assert.deepEqual(summarize([]), { totalDebit: 0, totalCredit: 0, averageDaily: 0, averageMonthly: 0 })
})
