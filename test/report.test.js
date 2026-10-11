const test = require("node:test")
const assert = require("node:assert/strict")

const {
    UNCATEGORIZED,
    daysBetween,
    inDateRange,
    presetRange,
    previousPeriod,
    monthlySummary,
    categoryBreakdown,
    spendingHabits,
    debitTotalsBy,
    findRecurringPayments,
    findNewSources,
    largestTransactions,
    findOutliers,
    findDuplicates,
    findBalanceMismatches,
    balanceSummary,
    salaryCycles
} = require("../analysis.js")

const row = (TranDate, Debit = 0, Credit = 0, extra = {}) => ({ TranDate, Debit, Credit, Balance: 0, TranSource: "", Category: UNCATEGORIZED, ...extra })

const paid = (TranDate, TranSource, Debit) => row(TranDate, Debit, 0, { TranSource })

test("daysBetween counts calendar days across months", () => {
    assert.equal(daysBetween("2024-01-31", "2024-03-01"), 30)
    assert.equal(daysBetween("2024-03-10", "2024-03-10"), 0)
})

test("inDateRange includes both ends and treats an empty end as open", () => {
    const rows = [row("2024-01-01"), row("2024-01-15"), row("2024-01-31")]

    assert.equal(inDateRange(rows, "2024-01-15", "2024-01-31").length, 2)
    assert.equal(inDateRange(rows, "", "2024-01-15").length, 2)
    assert.equal(inDateRange(rows, "", "").length, 3)
})

test("presetRange counts back from the statement's last date", () => {
    assert.deepEqual(presetRange("latestMonth", "2023-11-20", "2024-02-10"), { from: "2024-02-01", to: "2024-02-10" })
    assert.deepEqual(presetRange("previousMonth", "2023-11-20", "2024-02-10"), { from: "2024-01-01", to: "2024-01-31" })
    assert.deepEqual(presetRange("lastThreeMonths", "2023-11-20", "2024-02-10"), { from: "2023-12-01", to: "2024-02-10" })
    assert.deepEqual(presetRange("financialYear", "2023-01-05", "2024-02-10"), { from: "2023-04-01", to: "2024-02-10" })
    assert.deepEqual(presetRange("financialYear", "2023-01-05", "2024-05-10"), { from: "2024-04-01", to: "2024-05-10" })
    assert.deepEqual(presetRange("all", "2023-11-20", "2024-02-10"), { from: "2023-11-20", to: "2024-02-10" })
})

test("presetRange keeps the start inside the statement", () => {
    assert.deepEqual(presetRange("lastThreeMonths", "2024-01-20", "2024-02-10"), { from: "2024-01-20", to: "2024-02-10" })
    // The previous month is before the statement, the range stays empty instead of turning around
    assert.deepEqual(presetRange("previousMonth", "2024-02-03", "2024-02-10"), { from: "2024-01-01", to: "2024-01-31" })
})

test("debitTotalsBy counts debits per key and skips credits and empty keys", () => {
    const rows = [paid("2024-01-01", "SWIGGY", 100), paid("2024-01-02", "SWIGGY", 50), paid("2024-01-02", "AMAZON", 500),
        paid("2024-01-03", "", 70), row("2024-01-04", 0, 1000, { TranSource: "EMPLOYER" })]

    assert.deepEqual(debitTotalsBy(rows, r => r.TranSource), [
        { key: "AMAZON", count: 1, debit: 500 },
        { key: "SWIGGY", count: 2, debit: 150 }
    ])
})

test("findRecurringPayments finds a monthly payment and ignores an extra one-off", () => {
    const rows = [
        paid("2024-01-05", "NETFLIX", 649), paid("2024-02-05", "NETFLIX", 649),
        paid("2024-02-20", "NETFLIX", 199), paid("2024-03-05", "NETFLIX", 649)
    ]

    const [netflix, ...rest] = findRecurringPayments(rows, "", "")

    assert.equal(rest.length, 0)
    assert.deepEqual(netflix, { source: "NETFLIX", amount: 649, months: 3, lastDate: "2024-03-05" })
})

test("findRecurringPayments allows a small change in amount", () => {
    const rows = [paid("2024-01-01", "LANDLORD", 18000), paid("2024-02-02", "LANDLORD", 18500), paid("2024-03-01", "LANDLORD", 18000)]

    assert.equal(findRecurringPayments(rows, "", "").length, 1)
})

test("findRecurringPayments skips frequent payments, short histories and payments outside the range", () => {
    const frequent = []
    for (const month of ["01", "02", "03"]) {
        for (const day of ["03", "10", "17", "24"]) frequent.push(paid(`2024-${month}-${day}`, "SWIGGY", 200))
    }
    assert.equal(findRecurringPayments(frequent, "", "").length, 0)

    assert.equal(findRecurringPayments([paid("2024-01-05", "NETFLIX", 649), paid("2024-02-05", "NETFLIX", 649)], "", "").length, 0)

    const monthly = [paid("2024-01-05", "NETFLIX", 649), paid("2024-02-05", "NETFLIX", 649), paid("2024-03-05", "NETFLIX", 649)]
    assert.equal(findRecurringPayments(monthly, "2024-03-10", "2024-03-31").length, 0)
    assert.equal(findRecurringPayments(monthly, "2024-03-01", "2024-03-31").length, 1)
})

test("findNewSources lists sources that first appear in the range", () => {
    const rows = [
        paid("2024-01-10", "SWIGGY", 100),
        row("2024-01-20", 0, 500, { TranSource: "RAVI" }),
        paid("2024-02-03", "SWIGGY", 100), paid("2024-02-05", "RAVI", 300),
        paid("2024-02-08", "ZEPTO", 250), paid("2024-02-12", "ZEPTO", 150)
    ]

    assert.deepEqual(findNewSources(rows, "2024-02-01", "2024-02-29"), [
        { key: "ZEPTO", count: 2, debit: 400, firstDate: "2024-02-08" }
    ])
})

test("largestTransactions returns the biggest rows of one side", () => {
    const rows = [row("2024-01-01", 10), row("2024-01-02", 300), row("2024-01-03", 0, 5000), row("2024-01-04", 20)]

    assert.deepEqual(largestTransactions(rows, "Debit", 2).map(r => r.Debit), [300, 20])
    assert.deepEqual(largestTransactions(rows, "Credit").map(r => r.Credit), [5000])
})

test("findOutliers uses the whole statement as the baseline", () => {
    const food = (date, amount) => row(date, amount, 0, { Category: "Food / Snacks" })
    const rows = [
        food("2024-01-01", 200), food("2024-01-02", 300), food("2024-01-03", 250),
        food("2024-01-04", 350), food("2024-01-05", 300),
        food("2024-02-10", 4800),
        food("2024-02-11", 900)  // over 3x, but under the minimum amount
    ]

    const outliers = findOutliers(rows, "2024-02-01", "2024-02-29")

    assert.equal(outliers.length, 1)
    assert.equal(outliers[0].row.Debit, 4800)
    assert.equal(outliers[0].usual, 300)
    assert.equal(outliers[0].times, 16)
})

test("findOutliers needs enough debits and skips uncategorized", () => {
    const rows = [
        row("2024-01-01", 100, 0, { Category: "Fuel" }), row("2024-01-02", 5000, 0, { Category: "Fuel" }),
        ...[1, 2, 3, 4, 5].map(day => row(`2024-01-0${day}`, 100)), row("2024-01-09", 9000)
    ]

    assert.deepEqual(findOutliers(rows, "", ""), [])
})

test("findDuplicates groups debits with the same date, amount and label", () => {
    const rows = [paid("2024-01-01", "UBER", 250), paid("2024-01-01", "UBER", 250), paid("2024-01-01", "UBER", 300),
        paid("2024-01-02", "UBER", 250), row("2024-01-01", 0, 250, { TranSource: "UBER" })]

    assert.deepEqual(findDuplicates(rows, r => r.TranSource), [{ date: "2024-01-01", amount: 250, label: "UBER", count: 2 }])
})

test("findBalanceMismatches flags rows that don't follow from the row before", () => {
    const rows = [
        row("2024-01-01", 0, 1000, { Balance: 1000 }),
        row("2024-01-02", 100.1, 0, { Balance: 899.9 }),
        row("2024-01-03", 200, 0, { Balance: 599.9 }),   // a 100 debit is missing before this row
        row("2024-01-04", 0, 0.2, { Balance: 600.1 })
    ]

    const mismatches = findBalanceMismatches(rows)

    assert.equal(mismatches.length, 1)
    assert.equal(mismatches[0].row.TranDate, "2024-01-03")
    assert.equal(mismatches[0].difference, -100)
})

test("balanceSummary works out opening, lows and daily figures for the range", () => {
    const rows = [
        row("2024-01-01", 0, 10000, { Balance: 10000 }),
        row("2024-01-03", 4000, 0, { Balance: 6000 }),
        row("2024-01-03", 5000, 0, { Balance: 1000 }),
        row("2024-01-04", 0, 3000, { Balance: 4000 }),
        row("2024-01-06", 1000, 0, { Balance: 3000 })
    ]

    const summary = balanceSummary(rows, "2024-01-02", "2024-01-05", 2000)

    assert.equal(summary.opening, 10000)
    assert.equal(summary.closing, 4000)
    assert.deepEqual(summary.lowest, { amount: 1000, date: "2024-01-03" })
    // The balance the range opens with is higher than any row in it
    assert.deepEqual(summary.highest, { amount: 10000, date: "2024-01-02" })
    // End of day: 2nd 10000, 3rd 1000, 4th 4000, 5th 4000
    assert.equal(summary.days, 4)
    assert.equal(summary.averageBalance, 4750)
    assert.equal(summary.daysBelow, 1)
})

test("balanceSummary only counts days the statement covers and handles an empty range", () => {
    const rows = [row("2024-01-10", 0, 500, { Balance: 500 }), row("2024-01-12", 100, 0, { Balance: 400 })]

    assert.equal(balanceSummary(rows, "2024-01-01", "2024-01-31", NaN).days, 3)
    assert.equal(balanceSummary(rows, "2024-01-01", "2024-01-31", NaN).daysBelow, null)
    assert.equal(balanceSummary(rows, "2024-02-01", "2024-02-28", 100), null)
})

test("salaryCycles counts days until the balance drops under 10% of the salary", () => {
    const rows = [
        row("2024-01-01", 0, 50000, { Balance: 50000 }),
        row("2024-01-20", 46000, 0, { Balance: 4000 }),     // under 5000 after 19 days
        row("2024-02-01", 0, 50000, { Balance: 54000 }),
        row("2024-02-15", 10000, 0, { Balance: 44000 }),    // never under 5000 before next salary
        row("2024-03-01", 0, 52000, { Balance: 96000 }),
        row("2024-03-05", 0, 1000, { Balance: 97000 })
    ]

    assert.deepEqual(salaryCycles(rows, "", ""), [
        { date: "2024-01-01", amount: 50000, days: 19, droppedOn: "2024-01-20", nextSalary: "2024-02-01" },
        { date: "2024-02-01", amount: 50000, days: 29, droppedOn: null, nextSalary: "2024-03-01" },
        { date: "2024-03-01", amount: 52000, days: 4, droppedOn: null, nextSalary: null }
    ])
    assert.equal(salaryCycles(rows, "2024-02-01", "2024-02-29").length, 1)
})

test("salaryCycles returns null without 3 similar monthly credits", () => {
    const rows = [row("2024-01-01", 0, 50000), row("2024-02-01", 0, 50000), row("2024-03-01", 0, 9000)]

    assert.equal(salaryCycles(rows, "", ""), null)
})

test("previousPeriod is the same number of days right before", () => {
    assert.deepEqual(previousPeriod("2024-03-01", "2024-03-31"), { from: "2024-01-30", to: "2024-02-29" })
    assert.deepEqual(previousPeriod("2024-03-10", "2024-03-10"), { from: "2024-03-09", to: "2024-03-09" })
})

test("monthlySummary totals each month and marks months the range only partly covers", () => {
    const rows = [row("2024-01-20", 100, 1000), row("2024-02-03", 50), row("2024-02-28", 25, 10), row("2024-03-02", 5)]

    assert.deepEqual(monthlySummary(rows, "2024-01-15", "2024-03-02"), [
        { month: "2024-01", credit: 1000, debit: 100, partial: true },
        { month: "2024-02", credit: 10, debit: 75, partial: false },
        { month: "2024-03", credit: 0, debit: 5, partial: true }
    ])
})

test("categoryBreakdown gives shares and compares with the previous period", () => {
    const spend = (category, amount) => row("2024-02-01", amount, 0, { Category: category })
    const breakdown = categoryBreakdown(
        [spend("Fuel", 300), spend("Food / Snacks", 100), spend("Fuel", 100)],
        [spend("Fuel", 200), spend("Shopping", 500)])

    assert.deepEqual(breakdown, [
        { key: "Fuel", count: 2, debit: 400, share: 0.8, previous: 200 },
        { key: "Food / Snacks", count: 1, debit: 100, share: 0.2, previous: 0 },
        { key: "Shopping", count: 0, debit: 0, share: 0, previous: 500 }
    ])
    assert.equal(categoryBreakdown([spend("Fuel", 10)], null)[0].previous, null)
})

test("spendingHabits splits weekdays, weekends and parts of the month and finds no-spend runs", () => {
    // 2024-01-06 and 07 are a weekend
    const rows = [row("2024-01-01", 100), row("2024-01-02", 150), row("2024-01-06", 400), row("2024-01-11", 50), row("2024-01-21", 300), row("2024-01-11", 0, 999)]

    const habits = spendingHabits(rows, "2024-01-01", "2024-01-21")

    assert.equal(habits.days, 21)
    assert.equal(habits.weekendDays, 6)
    assert.equal(habits.weekendAverage, 700 / 6)
    assert.equal(habits.weekdayAverage, 300 / 15)
    assert.deepEqual(habits.busiestDay, { day: "Saturday", debit: 400 })
    assert.deepEqual(habits.parts.map(part => part.debit), [650, 50, 300])
    assert.equal(habits.noSpendDays, 16)
    assert.deepEqual(habits.longestNoSpend, { days: 9, from: "2024-01-12", to: "2024-01-20" })
    assert.deepEqual(habits.smallSpends, { count: 3, debit: 300, share: 3 / 5 })
})

test("spendingHabits with no debits has no busiest day", () => {
    const habits = spendingHabits([row("2024-01-01", 0, 500)], "2024-01-01", "2024-01-01")

    assert.equal(habits.busiestDay, null)
    assert.equal(habits.weekendAverage, null)
    assert.equal(habits.noSpendDays, 1)
})
