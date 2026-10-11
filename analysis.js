// Pure helpers for reading statement rows and adding up transactions.
// index.html loads this as a plain script (everything lands on window),
// the tests in test/ require it as a CommonJS module.
(function (root, factory) {
    const api = factory()
    if (typeof module === "object" && module.exports) {
        module.exports = api
    } else {
        Object.assign(root, api)
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

    const UNCATEGORIZED = "Uncategorized"

    // Columns a format can map to a header in the statement
    const MAPPED_FIELDS = ["TranDate", "ChequeNo", "TranDetail", "Debit", "Credit", "Balance"]

    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    const MONTH_NUMBERS = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    }

    const pad = (num) => String(num).padStart(2, "0")

    function buildDate(year, month, day) {
        year = Number(year)
        month = Number(month)
        day = Number(day)

        if (year < 100) year += 2000
        if (month < 1 || month > 12 || day < 1) return null

        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
        if (day > daysInMonth) return null

        return `${year}-${pad(month)}-${pad(day)}`
    }

    // Returns "YYYY-MM-DD", or null when the value is not a date we can read.
    // Text dates are read day first (15/01/2024, 5-1-24, 15 Jan 2024) the way Indian banks print them.
    function normalizeDate(value) {
        if (value == null) return null

        if (typeof value === "number") {
            // Excel serial date, worked out in UTC so the local timezone can't shift the day
            if (!Number.isFinite(value) || value < 1) return null
            const date = new Date((Math.floor(value) - 25569) * 86400 * 1000)
            return buildDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
        }

        if (value instanceof Date) {
            if (isNaN(value)) return null
            return buildDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
        }

        const text = String(value).trim()

        let match = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/)
        if (match) {
            return buildDate(match[1], match[2], match[3])
        }

        match = text.match(/^(\d{1,2})[-\/. ]+(\d{1,2}|[a-z]{3,9})[-\/., ]+(\d{4}|\d{2})(?!\d)/i)
        if (match) {
            const month = /^\d+$/.test(match[2]) ? match[2] : MONTH_NUMBERS[match[2].slice(0, 3).toLowerCase()]
            if (!month) return null
            return buildDate(match[3], month, match[1])
        }

        return null
    }

    // Reads 1234.56, "1,234.56", "Rs. 1,234.56" or "1,234.56 Cr" as a number; anything else is 0
    function parseAmount(value) {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0
        if (value == null) return 0

        const match = String(value).replace(/[,\s]/g, "").match(/-?\d+(?:\.\d+)?/)
        return match ? Number(match[0]) : 0
    }

    // Lowercase and drop apostrophes so "McDonald's" also matches "MCDONALDS"
    const normalizeText = (text) => String(text ?? "").toLowerCase().replace(/['’]/g, "")

    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    // Keywords of 4 characters or less have to match a whole word ("vi" must not match "Ravi"),
    // longer ones can sit inside a word ("swiggy" in "SWIGGY8@YBL").
    // Longest keyword is tried first so "indian oil" wins over "oil".
    function buildCategoryMatchers(categoryMap) {
        const matchers = []

        for (const [category, keywords] of Object.entries(categoryMap)) {
            const uniqueKeywords = new Set(keywords.map(keyword => normalizeText(keyword).trim()).filter(Boolean))

            for (const keyword of uniqueKeywords) {
                matchers.push({
                    category,
                    keyword,
                    wordRegex: keyword.length <= 4 ? new RegExp(`(?:^|[^a-z0-9])${escapeRegex(keyword)}(?![a-z0-9])`) : null
                })
            }
        }

        // sort is stable, so keywords of the same length keep the order of categoryMap
        return matchers.sort((a, b) => b.keyword.length - a.keyword.length)
    }

    function categorize(text, matchers) {
        const normalized = normalizeText(text)

        for (const matcher of matchers) {
            if (!normalized.includes(matcher.keyword)) continue
            if (matcher.wordRegex && !matcher.wordRegex.test(normalized)) continue
            return matcher.category
        }

        return UNCATEGORIZED
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
    }

    const compareDates = (a, b) => a.TranDate < b.TranDate ? -1 : (a.TranDate > b.TranDate ? 1 : 0)

    const sortByDate = (rows) => [...rows].sort(compareDates)

    // Statements come oldest first or newest first. This always gives oldest first
    // while keeping rows of the same day in the order they happened.
    function toChronological(rows) {
        const ordered = [...rows]
        if (ordered.length > 1 && ordered[0].TranDate > ordered[ordered.length - 1].TranDate) {
            ordered.reverse()
        }
        return sortByDate(ordered)
    }

    const isBlank = (value) => value == null || String(value).trim() === ""

    // Mapped header names that the statement does not have
    function findMissingColumns(headers, format) {
        return MAPPED_FIELDS
            .map(field => String(format[field] ?? "").trim())
            .filter(column => column !== "" && !headers.includes(column))
    }

    // Turns the header-keyed records of a statement into transactions, oldest first.
    // Rows without a readable date are left out and counted in `skipped`.
    function buildTransactions(records, format, tagMap, matchers) {
        const isSplit = format.IsSplitTran == "true"

        const read = (record, field) => {
            const column = String(format[field] ?? "").trim()
            return column === "" ? undefined : record[column]
        }

        const transactions = []
        let skipped = 0

        for (const record of records) {
            if (Object.values(record).every(isBlank)) continue

            const tranDate = normalizeDate(read(record, "TranDate"))
            if (tranDate == null) {
                skipped++
                continue
            }

            const tranDetail = String(read(record, "TranDetail") ?? "").trim()

            let tranNo = ""
            let tranSource = ""
            if (isSplit) {
                const parts = tranDetail.split(format.Seperator)
                tranNo = String(parts[Number(format.TranNoIndex) - 1] ?? "").trim()
                tranSource = String(parts[Number(format.TranSourceIndex) - 1] ?? "").trim()
            }

            transactions.push({
                TranDate: tranDate,
                ChequeNo: read(record, "ChequeNo") ?? "",
                TranDetail: tranDetail,
                Debit: parseAmount(read(record, "Debit")),
                Credit: parseAmount(read(record, "Credit")),
                Balance: parseAmount(read(record, "Balance")),
                TranNo: tranNo,
                TranSource: tranSource,
                SrcTag: isSplit ? (tagMap[tranSource] ?? "") : "",
                Category: categorize(isSplit ? tranSource : tranDetail, matchers)
            })
        }

        return { transactions: toChronological(transactions), skipped }
    }

    // Debit and credit totals per key, sorted by key
    function groupTotals(rows, keyOf) {
        const groups = new Map()

        for (const row of rows) {
            const key = keyOf(row)
            const group = groups.get(key) ?? { key, debit: 0, credit: 0 }
            group.debit += row.Debit
            group.credit += row.Credit
            groups.set(key, group)
        }

        return [...groups.values()].sort((a, b) => a.key < b.key ? -1 : (a.key > b.key ? 1 : 0))
    }

    const yearOf = (isoDate) => isoDate.slice(0, 4)
    const monthOf = (isoDate) => isoDate.slice(0, 7)

    // Totals per day ("01".."31") for one month given as "YYYY-MM"
    function dailyTotals(rows, month) {
        return groupTotals(rows.filter(row => monthOf(row.TranDate) === month), row => row.TranDate.slice(8, 10))
    }

    // Totals per month ("01".."12") for one year given as "YYYY"
    function monthlyTotals(rows, year) {
        return groupTotals(rows.filter(row => yearOf(row.TranDate) === year), row => row.TranDate.slice(5, 7))
    }

    // Totals per weekday, always all 7 days starting with Sunday
    function weekdayTotals(rows) {
        const totals = WEEKDAYS.map(day => ({ key: day, debit: 0, credit: 0 }))

        for (const row of rows) {
            const [year, month, day] = row.TranDate.split("-").map(Number)
            const total = totals[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
            total.debit += row.Debit
            total.credit += row.Credit
        }

        return totals
    }

    // Totals per category, in the order of `categories`
    function categoryTotals(rows, categories) {
        const totals = new Map(categories.map(category => [category, { key: category, debit: 0, credit: 0 }]))

        for (const row of rows) {
            const total = totals.get(row.Category)
            if (total) {
                total.debit += row.Debit
                total.credit += row.Credit
            }
        }

        return [...totals.values()]
    }

    // Averages are over the days and months that have at least one transaction
    function summarize(rows) {
        let totalDebit = 0
        let totalCredit = 0
        const days = new Set()
        const months = new Set()

        for (const row of rows) {
            totalDebit += row.Debit
            totalCredit += row.Credit
            days.add(row.TranDate)
            months.add(monthOf(row.TranDate))
        }

        return {
            totalDebit,
            totalCredit,
            averageDaily: totalDebit / Math.max(days.size, 1),
            averageMonthly: totalDebit / Math.max(months.size, 1)
        }
    }

    // ----- Report -----
    // Functions that need data from outside the selected range (a baseline, the row before, a repeat)
    // take the whole statement oldest first plus the range, and look at the range themselves.

    const DAY_MS = 86400 * 1000

    const RECURRING_TOLERANCE = 0.1
    const RECURRING_MIN_MONTHS = 3

    const OUTLIER_RATIO = 3
    const OUTLIER_MIN_AMOUNT = 1000
    const OUTLIER_MIN_SAMPLES = 5

    const SALARY_TOLERANCE = 0.2
    const SALARY_MIN_MONTHS = 3
    const SALARY_LOW_SHARE = 0.1

    const SMALL_SPEND_LIMIT = 200

    const toUtc = (isoDate) => {
        const [year, month, day] = isoDate.split("-").map(Number)
        return Date.UTC(year, month - 1, day)
    }

    const fromUtc = (time) => new Date(time).toISOString().slice(0, 10)

    const addDays = (isoDate, days) => fromUtc(toUtc(isoDate) + days * DAY_MS)

    const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

    // Date.UTC rolls month 0 back to December of the year before, so month - 2 works across years
    const monthStart = (year, month) => fromUtc(Date.UTC(year, month - 1, 1))

    const isInRange = (row, from, to) => (!from || row.TranDate >= from) && (!to || row.TranDate <= to)

    const countMonths = (rows) => new Set(rows.map(row => monthOf(row.TranDate))).size

    function median(values) {
        if (values.length === 0) return 0
        const sorted = [...values].sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    }

    // Rows from `from` to `to` ("YYYY-MM-DD", both included), an empty end is open
    function inDateRange(rows, from, to) {
        return rows.filter(row => isInRange(row, from, to))
    }

    // Range for a preset button, counted back from the statement's last date so an old statement
    // still gets a useful "latest month". The start is kept inside the statement.
    function presetRange(preset, firstDate, lastDate) {
        const [year, month] = lastDate.split("-").map(Number)
        let from = firstDate
        let to = lastDate

        switch (preset) {
        case "latestMonth":
            from = monthStart(year, month)
            break
        case "previousMonth":
            from = monthStart(year, month - 1)
            to = addDays(monthStart(year, month), -1)
            break
        case "lastThreeMonths":
            from = monthStart(year, month - 2)
            break
        case "financialYear":
            from = `${month >= 4 ? year : year - 1}-04-01`
            break
        }

        if (from < firstDate && firstDate <= to) from = firstDate
        return { from, to }
    }

    // The period of the same length just before from..to
    function previousPeriod(from, to) {
        const days = daysBetween(from, to) + 1
        return { from: addDays(from, -days), to: addDays(from, -1) }
    }

    // Money in and out per month ("YYYY-MM"), oldest first. A month is partial when start..end
    // (the days both the range and the statement cover) doesn't include all of it.
    function monthlySummary(rows, start, end) {
        return groupTotals(rows, row => monthOf(row.TranDate)).map(total => {
            const [year, month] = total.key.split("-").map(Number)
            const firstDay = monthStart(year, month)
            const lastDay = addDays(monthStart(year, month + 1), -1)
            return { month: total.key, credit: total.credit, debit: total.debit, partial: firstDay < start || lastDay > end }
        })
    }

    // Spending per category, biggest first, with its share of all spending. With previousRows,
    // `previous` is what the category spent then (categories only spent on then are added at the end).
    function categoryBreakdown(rows, previousRows) {
        const current = debitTotalsBy(rows, row => row.Category)
        const total = current.reduce((sum, category) => sum + category.debit, 0)
        const previous = previousRows ? new Map(debitTotalsBy(previousRows, row => row.Category).map(category => [category.key, category.debit])) : null

        const breakdown = current.map(category => ({
            ...category,
            share: total > 0 ? category.debit / total : 0,
            previous: previous ? (previous.get(category.key) ?? 0) : null
        }))

        if (previous) {
            for (const [key, debit] of previous) {
                if (!current.some(category => category.key === key)) {
                    breakdown.push({ key, count: 0, debit: 0, share: 0, previous: debit })
                }
            }
        }

        return breakdown
    }

    // When the money goes, over the calendar days start..end. Days without a debit are no-spend days.
    function spendingHabits(rows, start, end) {
        const dailySpend = new Map()
        for (const row of rows) {
            if (row.Debit > 0) dailySpend.set(row.TranDate, (dailySpend.get(row.TranDate) ?? 0) + row.Debit)
        }

        const weekday = { spend: 0, days: 0 }
        const weekend = { spend: 0, days: 0 }
        const parts = [{ label: "Days 1–10", debit: 0 }, { label: "Days 11–20", debit: 0 }, { label: "Days 21–end", debit: 0 }]
        let days = 0
        let noSpendDays = 0
        let streak = 0
        let streakStart = null
        let longestNoSpend = { days: 0, from: null, to: null }

        for (let date = start; date <= end; date = addDays(date, 1)) {
            const spend = dailySpend.get(date) ?? 0
            const dayOfWeek = new Date(toUtc(date)).getUTCDay()
            const dayOfMonth = Number(date.slice(8, 10))

            const week = dayOfWeek === 0 || dayOfWeek === 6 ? weekend : weekday
            week.spend += spend
            week.days++
            parts[dayOfMonth <= 10 ? 0 : (dayOfMonth <= 20 ? 1 : 2)].debit += spend
            days++

            if (spend === 0) {
                noSpendDays++
                if (streak === 0) streakStart = date
                streak++
                if (streak > longestNoSpend.days) longestNoSpend = { days: streak, from: streakStart, to: date }
            } else {
                streak = 0
            }
        }

        const debits = rows.filter(row => row.Debit > 0)
        const small = debits.filter(row => row.Debit < SMALL_SPEND_LIMIT)
        const busiest = weekdayTotals(rows).reduce((best, day) => day.debit > best.debit ? day : best)

        return {
            days,
            weekdayAverage: weekday.days > 0 ? weekday.spend / weekday.days : null,
            weekdayDays: weekday.days,
            weekendAverage: weekend.days > 0 ? weekend.spend / weekend.days : null,
            weekendDays: weekend.days,
            busiestDay: busiest.debit > 0 ? { day: busiest.key, debit: busiest.debit } : null,
            parts,
            noSpendDays,
            longestNoSpend,
            smallSpends: {
                count: small.length,
                debit: small.reduce((sum, row) => sum + row.Debit, 0),
                share: debits.length > 0 ? small.length / debits.length : 0
            }
        }
    }

    // Number of debits and their total per key, biggest total first. Rows with an empty key are left out.
    function debitTotalsBy(rows, keyOf) {
        const groups = new Map()

        for (const row of rows) {
            const key = String(keyOf(row) ?? "").trim()
            if (row.Debit <= 0 || key === "") continue

            const group = groups.get(key) ?? { key, count: 0, debit: 0 }
            group.count++
            group.debit += row.Debit
            groups.set(key, group)
        }

        return [...groups.values()].sort((a, b) => b.debit - a.debit)
    }

    // Debits to the same source of about the same amount (±10%) about once a month, in at least 3 months.
    // Looked for over all of `rows`, since a short range can't show a repeat, and kept when one of
    // the payments falls in the range.
    function findRecurringPayments(rows, from, to) {
        const bySource = new Map()
        for (const row of rows) {
            const source = String(row.TranSource ?? "").trim()
            if (row.Debit <= 0 || source === "") continue
            if (!bySource.has(source)) bySource.set(source, [])
            bySource.get(source).push(row)
        }

        const recurring = []

        for (const [source, payments] of bySource) {
            // The amount paid in the most months, so an extra one-off payment doesn't hide the regular one
            let regular = []
            let regularMonths = 0
            for (const candidate of payments) {
                const similar = payments.filter(payment => Math.abs(payment.Debit - candidate.Debit) <= candidate.Debit * RECURRING_TOLERANCE)
                const months = countMonths(similar)
                if (months > regularMonths) {
                    regular = similar
                    regularMonths = months
                }
            }
            if (regularMonths < RECURRING_MIN_MONTHS) continue

            // Several similar payments a week (food orders) are not a monthly payment
            const dates = regular.map(payment => payment.TranDate).sort()
            const typicalGap = median(dates.slice(1).map((date, index) => daysBetween(dates[index], date)))
            if (typicalGap < 20 || typicalGap > 40) continue

            if (!regular.some(payment => isInRange(payment, from, to))) continue

            recurring.push({
                source,
                amount: median(regular.map(payment => payment.Debit)),
                months: regularMonths,
                lastDate: dates[dates.length - 1]
            })
        }

        return recurring.sort((a, b) => b.amount - a.amount)
    }

    // Sources paid in the range that don't appear anywhere before the range starts
    function findNewSources(rows, from, to) {
        const sourceOf = (row) => String(row.TranSource ?? "").trim()
        const seenBefore = new Set(rows.filter(row => from && row.TranDate < from).map(sourceOf))
        const newRows = inDateRange(rows, from, to).filter(row => !seenBefore.has(sourceOf(row)))

        const firstDates = new Map()
        for (const row of newRows) {
            if (!firstDates.has(sourceOf(row))) firstDates.set(sourceOf(row), row.TranDate)
        }

        return debitTotalsBy(newRows, sourceOf).map(total => ({ ...total, firstDate: firstDates.get(total.key) }))
    }

    // The `limit` biggest rows by "Debit" or "Credit"
    function largestTransactions(rows, field, limit = 5) {
        return rows.filter(row => row[field] > 0).sort((a, b) => b[field] - a[field]).slice(0, limit)
    }

    // Debits in the range of at least ₹1,000 that are over 3x the usual (middle) debit of their category.
    // The usual amount comes from all of `rows`, so a big spend in a short range can't raise its own baseline.
    // Categories with fewer than 5 debits have no usual amount, and neither does Uncategorized.
    function findOutliers(rows, from, to) {
        const amounts = new Map()
        for (const row of rows) {
            if (row.Debit <= 0 || row.Category === UNCATEGORIZED) continue
            if (!amounts.has(row.Category)) amounts.set(row.Category, [])
            amounts.get(row.Category).push(row.Debit)
        }

        const usual = new Map()
        for (const [category, debits] of amounts) {
            if (debits.length >= OUTLIER_MIN_SAMPLES) usual.set(category, median(debits))
        }

        return inDateRange(rows, from, to)
            .filter(row => usual.has(row.Category) && row.Debit >= OUTLIER_MIN_AMOUNT && row.Debit > usual.get(row.Category) * OUTLIER_RATIO)
            .map(row => ({ row, usual: usual.get(row.Category), times: row.Debit / usual.get(row.Category) }))
            .sort((a, b) => b.row.Debit - a.row.Debit)
    }

    // Debits with the same date, amount and label (source or detail), once per group with how many there are
    function findDuplicates(rows, labelOf) {
        const groups = new Map()

        for (const row of rows) {
            if (row.Debit <= 0) continue
            const label = String(labelOf(row) ?? "").trim()
            const key = `${row.TranDate}|${row.Debit}|${label}`
            const group = groups.get(key) ?? { date: row.TranDate, amount: row.Debit, label, count: 0 }
            group.count++
            groups.set(key, group)
        }

        return [...groups.values()].filter(group => group.count > 1)
    }

    // Rows whose balance isn't the balance before plus credit minus debit.
    // A missing row gives one mismatch, a misread balance gives two (that row and the next).
    function findBalanceMismatches(rows) {
        const mismatches = []

        for (let index = 1; index < rows.length; index++) {
            const row = rows[index]
            const expected = rows[index - 1].Balance + row.Credit - row.Debit
            const difference = Math.round((row.Balance - expected) * 100) / 100
            if (difference !== 0) {
                mismatches.push({ row, expected, difference })
            }
        }

        return mismatches
    }

    // Balance figures for the range, or null when it has no rows.
    // The daily average and days below `threshold` use the balance at the end of every calendar day
    // (a day without transactions keeps the day before's), only over days the statement covers.
    function balanceSummary(rows, from, to, threshold) {
        const inRange = inDateRange(rows, from, to)
        if (inRange.length === 0) return null

        const first = inRange[0]
        const last = inRange[inRange.length - 1]
        const opening = first.Balance + first.Debit - first.Credit

        const statementStart = rows[0].TranDate
        const statementEnd = rows[rows.length - 1].TranDate
        const start = from && from > statementStart ? from : statementStart
        const end = to && to < statementEnd ? to : statementEnd

        // The balance the range starts with counts too, it can be lower than any row after it
        let lowest = { amount: opening, date: start }
        let highest = { amount: opening, date: start }
        for (const row of inRange) {
            if (row.Balance < lowest.amount) lowest = { amount: row.Balance, date: row.TranDate }
            if (row.Balance > highest.amount) highest = { amount: row.Balance, date: row.TranDate }
        }

        // Rows are oldest first, so the last row of each day sets that day's balance
        const endOfDay = new Map(inRange.map(row => [row.TranDate, row.Balance]))
        const countBelow = Number.isFinite(threshold)

        let balance = opening
        let total = 0
        let days = 0
        let daysBelow = 0
        for (let date = start; date <= end; date = addDays(date, 1)) {
            if (endOfDay.has(date)) balance = endOfDay.get(date)
            total += balance
            days++
            if (countBelow && balance < threshold) daysBelow++
        }

        return {
            opening,
            closing: last.Balance,
            lowest,
            highest,
            averageBalance: total / Math.max(days, 1),
            days,
            daysBelow: countBelow ? daysBelow : null
        }
    }

    // The biggest credit of each month is taken as salary when at least 3 months have one of about
    // the same size (±20%). Returns null when no salary is found that way.
    // For every salary credited in the range: days until the balance first went under 10% of it,
    // looking until the next salary or the end of the statement.
    function salaryCycles(rows, from, to) {
        const biggest = new Map()
        for (const row of rows) {
            const month = monthOf(row.TranDate)
            if (row.Credit > 0 && row.Credit > (biggest.get(month)?.Credit ?? 0)) biggest.set(month, row)
        }

        const typical = median([...biggest.values()].map(row => row.Credit))
        const salaries = [...biggest.values()].filter(row => Math.abs(row.Credit - typical) <= typical * SALARY_TOLERANCE)
        if (salaries.length < SALARY_MIN_MONTHS) return null

        const cycles = []

        salaries.forEach((salary, index) => {
            if (!isInRange(salary, from, to)) return

            const next = salaries[index + 1]
            const cycleRows = rows.slice(rows.indexOf(salary) + 1, next ? rows.indexOf(next) : rows.length)
            const drop = cycleRows.find(row => row.Balance < salary.Credit * SALARY_LOW_SHARE)
            const until = drop ? drop.TranDate : (next ? next.TranDate : rows[rows.length - 1].TranDate)

            cycles.push({
                date: salary.TranDate,
                amount: salary.Credit,
                days: daysBetween(salary.TranDate, until),
                droppedOn: drop ? drop.TranDate : null,
                nextSalary: next ? next.TranDate : null
            })
        })

        return cycles
    }

    return {
        UNCATEGORIZED,
        MAPPED_FIELDS,
        normalizeDate,
        parseAmount,
        buildCategoryMatchers,
        categorize,
        escapeHtml,
        sortByDate,
        toChronological,
        findMissingColumns,
        buildTransactions,
        dailyTotals,
        monthlyTotals,
        weekdayTotals,
        categoryTotals,
        summarize,
        OUTLIER_RATIO,
        OUTLIER_MIN_AMOUNT,
        SALARY_LOW_SHARE,
        SMALL_SPEND_LIMIT,
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
    }
})
