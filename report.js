// Report page: what the dashboard doesn't show, for a date range of the loaded statement.
// It works on the whole statement and ignores the dashboard filters. Rows excluded from calculation
// on the dashboard are left out of the spending sections, the balance sections still see them.

const REPORT_TOP_LIMIT = 10
const REPORT_LIST_LIMIT = 20

const formatMoney = (amount, decimals = 2) => (amount < 0 ? "−" : "") + "₹" +
    Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

function formatDate(isoDate) {
    const [year, month, day] = isoDate.split("-")
    return `${Number(day)} ${SHORT_MONTHS[month]} ${year}`
}

const plural = (count, word) => `${count} ${word}${count == 1 ? "" : "s"}`

document.addEventListener("DOMContentLoaded", function () {
    document.querySelector("#reportBalanceThreshold").addEventListener("change", renderReport)
    document.querySelector("#reportOutlierHint").textContent =
        `Debits of ${formatMoney(OUTLIER_MIN_AMOUNT, 0)} or more that are over ${OUTLIER_RATIO}× the usual amount for their category. ` +
        "The usual amount is the middle debit of the category over the whole statement."
    document.querySelector("#reportSalaryHint").textContent =
        "The biggest credit of each month counts as salary when at least 3 months have one of about the same size. " +
        `Shows how many days it took for the balance to fall under ${SALARY_LOW_SHARE * 100}% of the salary.`
});

const hasStatement = () => loadedTransactions.length > 0
const statementStart = () => loadedTransactions[0].TranDate
const statementEnd = () => loadedTransactions[loadedTransactions.length - 1].TranDate

// A new statement was loaded, the report starts over on all of it
function resetReport() {
    for (const input of [document.querySelector("#reportFromDate"), document.querySelector("#reportToDate")]) {
        input.min = statementStart()
        input.max = statementEnd()
    }
    setReportRange(statementStart(), statementEnd(), "all")
}

function setReportRange(from, to, preset = null) {
    document.querySelector("#reportFromDate").value = from
    document.querySelector("#reportToDate").value = to
    document.querySelectorAll(".report-presets [data-preset]").forEach(button => {
        button.classList.toggle("active", button.dataset.preset === preset)
    })
    renderReport()
}

async function applyReportFilter() {
    if (!hasStatement()){
        return
    }

    const from = document.querySelector("#reportFromDate").value || statementStart()
    const to = document.querySelector("#reportToDate").value || statementEnd()

    if (from > to){
        window.api.showError("Date From must be on or before Date To");
        return
    }

    setReportRange(from, to)
}

async function applyReportPreset(element) {
    if (!hasStatement()){
        return
    }

    const { from, to } = presetRange(element.dataset.preset, statementStart(), statementEnd())
    setReportRange(from, to, element.dataset.preset)
}

function renderReport() {
    document.querySelector("#reportEmpty").classList.toggle("d-none", hasStatement())
    document.querySelector("#reportContent").classList.toggle("d-none", !hasStatement())

    if (!hasStatement()){
        return
    }

    const from = document.querySelector("#reportFromDate").value
    const to = document.querySelector("#reportToDate").value

    const allRows = loadedTransactions
    const countedRows = allRows.filter(row => !excludedDetails.includes(row.TranDetail))
    const rangeRows = inDateRange(countedRows, from, to)

    renderReportPeriod(from, to, rangeRows)

    document.querySelector("#reportSections").classList.toggle("d-none", rangeRows.length === 0)
    if (rangeRows.length === 0){
        return
    }

    const { start, end } = coveredRange(from, to)

    renderOverview(rangeRows, start, end)
    renderMonthly(allRows, rangeRows, from, to, start, end)
    renderCategories(countedRows, rangeRows, start, end)
    renderHabits(rangeRows, start, end)
    renderMerchants(countedRows, rangeRows, from, to)
    renderLargeTransactions(countedRows, rangeRows, from, to)
    renderBalanceHealth(allRows, from, to)
    renderDataQuality(allRows, rangeRows, from, to)
}

function renderReportPeriod(from, to, rangeRows) {
    const periodEl = document.querySelector("#reportPeriod")

    if (rangeRows.length === 0){
        periodEl.textContent = `No transactions from ${formatDate(from)} to ${formatDate(to)}.`
        return
    }

    const period = `${formatDate(from)} – ${formatDate(to)}`

    const debits = rangeRows.filter(row => row.Debit > 0).length
    const credits = rangeRows.filter(row => row.Credit > 0).length
    periodEl.textContent = `${period} · ${plural(daysBetween(from, to) + 1, "day")} · ` +
        `${plural(rangeRows.length, "transaction")} (${plural(debits, "debit")}, ${plural(credits, "credit")})`
}

// columns: { title, value(item) -> html, amount (right aligned) }
function reportTable(columns, items, emptyText) {
    if (items.length === 0){
        return `<p class="report-empty">${escapeHtml(emptyText)}</p>`
    }

    const cellClass = (column) => column.amount ? ' class="amount"' : ""
    const head = columns.map(column => `<th${cellClass(column)}>${escapeHtml(column.title)}</th>`).join("")
    const body = items.map(item => `<tr>${columns.map(column => `<td${cellClass(column)}>${column.value(item)}</td>`).join("")}</tr>`).join("")

    return `<table class="table table-sm report-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

// Shows the first `limit` items and says how many were left out
function limitedTable(columns, items, emptyText, limit = REPORT_LIST_LIMIT) {
    const more = items.length > limit ? `<p class="report-hint mt-1 mb-0">and ${items.length - limit} more</p>` : ""
    return reportTable(columns, items.slice(0, limit), emptyText) + more
}

const detailCell = (text) => `<span class="report-detail" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`

// The source says more than the full detail when the format splits it
const rowLabel = (row) => (currentFormat?.IsSplitTran == "true" && row.TranSource) || row.TranDetail

const dateColumn = (dateOf) => ({ title: "Date", value: item => formatDate(dateOf(item)) })
const moneyColumn = (title, amountOf) => ({ title, value: item => formatMoney(amountOf(item)), amount: true })

const percent = (share) => `${share < 0 ? "−" : ""}${Math.abs(Math.round(share * 100))}%`

const monthName = (month) => `${SHORT_MONTHS[month.slice(5, 7)]} ${month.slice(0, 4)}`

// The days both the range and the statement cover
function coveredRange(from, to) {
    return {
        start: from > statementStart() ? from : statementStart(),
        end: to < statementEnd() ? to : statementEnd()
    }
}

// "+₹1,200.00 (+25%)" against the amount before, more spending in red and less in green
function spendChange(current, previous) {
    if (previous == null){
        return "-"
    }

    const change = current - previous
    if (Math.round(change * 100) === 0){
        return `<span class="text-muted">No change</span>`
    }

    const sign = change > 0 ? "+" : ""
    const changePercent = previous > 0 ? ` (${sign}${percent(change / previous)})` : ""
    return `<span class="${change > 0 ? "text-danger" : "text-success"}">${sign}${formatMoney(change)}${changePercent}</span>`
}

function renderOverview(rangeRows, start, end) {
    const { totalDebit, totalCredit } = summarize(rangeRows)
    const net = totalCredit - totalDebit
    const days = daysBetween(start, end) + 1
    const topCategory = categoryBreakdown(rangeRows, null).find(category => category.key !== UNCATEGORIZED)

    document.querySelector("#reportOverview").innerHTML = `<div class="report-stats">` +
        statTile("Money in", formatMoney(totalCredit)) +
        statTile("Money out", formatMoney(totalDebit)) +
        statTile(net >= 0 ? "Saved" : "Overspent", formatMoney(Math.abs(net)), net >= 0 ? "Money in minus money out" : "Spent more than came in") +
        statTile("Savings rate", totalCredit > 0 ? percent(net / totalCredit) : "-", totalCredit > 0 ? "Share of money in that was kept" : "No money came in") +
        statTile("Average spend per day", formatMoney(totalDebit / days), `Over ${plural(days, "day")}, counting days without spending`) +
        (topCategory
            ? statTile("Top category", topCategory.key, `${formatMoney(topCategory.debit)} · ${percent(topCategory.share)} of spending`)
            : statTile("Top category", "-", "All spending is Uncategorized")) +
        `</div>`
}

function renderMonthly(allRows, rangeRows, from, to, start, end) {
    const months = monthlySummary(rangeRows, start, end)
        .map((month, index, list) => ({ ...month, net: month.credit - month.debit, previousDebit: index > 0 ? list[index - 1].debit : null }))
    const hasBalance = String(currentFormat?.Balance ?? "").trim() != ""

    // Last balance of each month, from every row since the balance is the bank's own figure
    const closing = new Map(inDateRange(allRows, from, to).map(row => [row.TranDate.slice(0, 7), row.Balance]))

    const table = reportTable([
        { title: "Month", value: item => monthName(item.month) + (item.partial ? ' <span class="report-partial">partial</span>' : "") },
        moneyColumn("Money in", item => item.credit),
        moneyColumn("Money out", item => item.debit),
        { title: "Net", value: item => `<span class="${item.net >= 0 ? "text-success" : "text-danger"}">${formatMoney(item.net)}</span>`, amount: true },
        { title: "Saved", value: item => item.credit > 0 ? percent(item.net / item.credit) : "-", amount: true },
        { title: "Spend vs month before", value: item => spendChange(item.debit, item.previousDebit), amount: true },
        ...(hasBalance ? [moneyColumn("Closing balance", item => closing.get(item.month) ?? 0)] : [])
    ], months, "No transactions in this period.")

    // Partial months would always look like the best or worst, so only whole months are compared
    const fullMonths = months.filter(month => !month.partial)
    let verdict = ""
    if (fullMonths.length >= 2){
        const best = fullMonths.reduce((most, month) => month.net > most.net ? month : most)
        const worst = fullMonths.reduce((least, month) => month.net < least.net ? month : least)
        verdict = `<p class="report-total">Saved the most in <b>${monthName(best.month)}</b> (${formatMoney(best.net)}) ` +
            `and the least in <b>${monthName(worst.month)}</b> (${formatMoney(worst.net)}).` +
            (fullMonths.length < months.length ? " Partial months are not compared." : "") + `</p>`
    }

    document.querySelector("#reportMonthly").innerHTML = table + verdict
}

function renderCategories(countedRows, rangeRows, start, end) {
    const previous = previousPeriod(start, end)
    const canCompare = previous.from >= statementStart()
    const breakdown = categoryBreakdown(rangeRows, canCompare ? inDateRange(countedRows, previous.from, previous.to) : null)

    document.querySelector("#reportCategoryHint").textContent =
        (canCompare
            ? `Compared with the ${plural(daysBetween(previous.from, previous.to) + 1, "day")} before (${formatDate(previous.from)} – ${formatDate(previous.to)}). `
            : "The statement doesn't go back far enough to compare with the same number of days before this period. ") +
        "Finance includes UPI and bank transfers, so part of it may be money sent to people rather than spending."

    const shareCell = (item) =>
        `<div class="report-share"><div class="report-share-bar"><span style="width: ${(item.share * 100).toFixed(1)}%"></span></div>${percent(item.share)}</div>`

    const table = reportTable([
        { title: "Category", value: item => escapeHtml(item.key) },
        moneyColumn("Amount", item => item.debit),
        { title: "Share", value: shareCell },
        { title: "Debits", value: item => item.count, amount: true },
        { title: "Average debit", value: item => item.count > 0 ? formatMoney(item.debit / item.count) : "-", amount: true },
        ...(canCompare ? [
            moneyColumn("Before", item => item.previous),
            { title: "Change", value: item => spendChange(item.debit, item.previous), amount: true }
        ] : [])
    ], breakdown, "No debits in this period.")

    let movers = ""
    if (canCompare){
        const changed = breakdown.filter(item => Math.round(item.debit - item.previous) !== 0)
        const up = changed.filter(item => item.debit > item.previous).sort((a, b) => (b.debit - b.previous) - (a.debit - a.previous))[0]
        const down = changed.filter(item => item.debit < item.previous).sort((a, b) => (a.debit - a.previous) - (b.debit - b.previous))[0]
        const lines = []
        if (up) lines.push(`Biggest increase: <b>${escapeHtml(up.key)}</b> ${spendChange(up.debit, up.previous)}`)
        if (down) lines.push(`Biggest drop: <b>${escapeHtml(down.key)}</b> ${spendChange(down.debit, down.previous)}`)
        movers = lines.length > 0 ? `<p class="report-total">${lines.join(" · ")}</p>` : ""
    }

    document.querySelector("#reportCategories").innerHTML = table + movers
}

function renderHabits(rangeRows, start, end) {
    const habits = spendingHabits(rangeRows, start, end)
    const totalSpend = habits.parts.reduce((total, part) => total + part.debit, 0)
    const debitCount = rangeRows.filter(row => row.Debit > 0).length
    const longest = habits.longestNoSpend
    const perDay = (average) => average == null ? "-" : formatMoney(average)

    const tiles =
        statTile("Weekday spend per day", perDay(habits.weekdayAverage), `Over ${plural(habits.weekdayDays, "weekday")}`) +
        statTile("Weekend spend per day", perDay(habits.weekendAverage), `Over ${plural(habits.weekendDays, "weekend day")}`) +
        statTile("Busiest day of the week", habits.busiestDay?.day ?? "-", habits.busiestDay ? `${formatMoney(habits.busiestDay.debit)} in total` : "No spending") +
        habits.parts.map(part => statTile(`${part.label} of the month`, formatMoney(part.debit),
            totalSpend > 0 ? `${percent(part.debit / totalSpend)} of spending` : "")).join("") +
        statTile("No-spend days", `${habits.noSpendDays} of ${habits.days}`,
            longest.days > 0 ? `Longest run: ${plural(longest.days, "day")} (${formatDate(longest.from)} – ${formatDate(longest.to)})` : "Spent something every day") +
        statTile(`Small spends under ${formatMoney(SMALL_SPEND_LIMIT, 0)}`, plural(habits.smallSpends.count, "debit"),
            `${formatMoney(habits.smallSpends.debit)} in total · ${percent(habits.smallSpends.share)} of debits`) +
        statTile("Average debit", debitCount > 0 ? formatMoney(totalSpend / debitCount) : "-", `Over ${plural(debitCount, "debit")}`)

    // Only worth saying when weekends clearly differ from weekdays
    let verdict = ""
    if (habits.weekdayAverage > 0 && habits.weekendAverage != null){
        const ratio = habits.weekendAverage / habits.weekdayAverage
        if (ratio >= 1.2) verdict = `<p class="report-total">You spend <b>${ratio.toFixed(1)}×</b> as much per day at weekends as on weekdays.</p>`
        if (ratio <= 0.8) verdict = `<p class="report-total">You spend less at weekends: <b>${percent(ratio)}</b> of a weekday's spending per day.</p>`
    }

    document.querySelector("#reportHabits").innerHTML = `<div class="report-stats">${tiles}</div>` + verdict
}

function renderMerchants(countedRows, rangeRows, from, to) {
    const isSplit = currentFormat?.IsSplitTran == "true"

    const note = document.querySelector("#reportSplitNote")
    note.classList.toggle("d-none", isSplit)
    note.querySelector("p").textContent = `Merchants, tags, recurring payments and new merchants need the transaction source. ` +
        `Turn on "Split transaction details" in the format "${currentFormat?.Title}" to see them.`
    document.querySelector("#reportMerchantGrid").classList.toggle("d-none", !isSplit)

    if (!isSplit){
        return
    }

    const merchantColumn = { title: "Merchant", value: item => detailCell(item.key) }
    const merchantColumns = [merchantColumn, { title: "Payments", value: item => item.count, amount: true }, moneyColumn("Total", item => item.debit)]

    const merchants = debitTotalsBy(rangeRows, row => row.TranSource)
    const byCount = [...merchants].sort((a, b) => b.count - a.count || b.debit - a.debit)

    document.querySelector("#reportTopByAmount").innerHTML = reportTable(merchantColumns, merchants.slice(0, REPORT_TOP_LIMIT), "No debits in this period.")
    document.querySelector("#reportTopByCount").innerHTML = reportTable(merchantColumns, byCount.slice(0, REPORT_TOP_LIMIT), "No debits in this period.")

    document.querySelector("#reportTags").innerHTML = reportTable(
        [{ title: "Tag", value: item => `<span class="tagStyle">${escapeHtml(item.key)}</span>` }, ...merchantColumns.slice(1)],
        debitTotalsBy(rangeRows, row => row.SrcTag),
        "No tagged payments in this period. Right-click a row on the Dashboard to tag its source.")

    // Starting with the statement, everything would count as new
    const newSourcesEl = document.querySelector("#reportNewSources")
    if (from <= countedRows[0].TranDate){
        newSourcesEl.innerHTML = `<p class="report-empty">This period starts with the statement, so there is nothing to compare with. Pick a later Date From.</p>`
    }else{
        newSourcesEl.innerHTML = limitedTable(
            [merchantColumn, dateColumn(item => item.firstDate), ...merchantColumns.slice(1)],
            findNewSources(countedRows, from, to),
            "No new merchants in this period.", REPORT_TOP_LIMIT)
    }

    const recurring = findRecurringPayments(countedRows, from, to)
    const monthsInStatement = new Set(countedRows.map(row => row.TranDate.slice(0, 7))).size
    const recurringEmpty = monthsInStatement < 3
        ? "Not enough data: the statement needs at least 3 months to spot monthly payments."
        : "No monthly payments found."
    const committed = recurring.reduce((total, payment) => total + payment.amount, 0)

    document.querySelector("#reportRecurring").innerHTML = reportTable([
        { title: "Merchant", value: item => detailCell(item.source) },
        moneyColumn("Usual amount", item => item.amount),
        { title: "Months seen", value: item => item.months, amount: true },
        { title: "Last paid", value: item => formatDate(item.lastDate) }
    ], recurring, recurringEmpty) +
        (recurring.length > 0 ? `<p class="report-total">Committed every month: <b>${formatMoney(committed)}</b></p>` : "")
}

function renderLargeTransactions(countedRows, rangeRows, from, to) {
    const labelColumn = { title: "Detail", value: row => detailCell(rowLabel(row)) }
    const categoryColumn = { title: "Category", value: row => escapeHtml(row.Category) }

    document.querySelector("#reportLargestDebits").innerHTML = reportTable(
        [dateColumn(row => row.TranDate), labelColumn, categoryColumn, moneyColumn("Amount", row => row.Debit)],
        largestTransactions(rangeRows, "Debit"), "No debits in this period.")

    document.querySelector("#reportLargestCredits").innerHTML = reportTable(
        [dateColumn(row => row.TranDate), labelColumn, moneyColumn("Amount", row => row.Credit)],
        largestTransactions(rangeRows, "Credit"), "No credits in this period.")

    document.querySelector("#reportOutliers").innerHTML = limitedTable([
        dateColumn(item => item.row.TranDate),
        { title: "Detail", value: item => detailCell(rowLabel(item.row)) },
        { title: "Category", value: item => escapeHtml(item.row.Category) },
        moneyColumn("Amount", item => item.row.Debit),
        moneyColumn("Usual", item => item.usual),
        { title: "Times usual", value: item => `${item.times.toFixed(1)}×`, amount: true }
    ], findOutliers(countedRows, from, to), "Nothing unusual in this period.")

    document.querySelector("#reportDuplicates").innerHTML = limitedTable([
        dateColumn(item => item.date),
        { title: "Detail", value: item => detailCell(item.label) },
        moneyColumn("Amount", item => item.amount),
        { title: "Times", value: item => item.count, amount: true }
    ], findDuplicates(rangeRows, rowLabel), "No possible duplicates in this period.")
}

const statTile = (label, value, note = "") =>
    `<div class="report-stat"><p>${escapeHtml(label)}</p><h5>${escapeHtml(value)}</h5>${note ? `<p>${escapeHtml(note)}</p>` : ""}</div>`

function renderBalanceHealth(allRows, from, to) {
    const balanceEl = document.querySelector("#reportBalance")
    const salaryEl = document.querySelector("#reportSalary")
    const hasBalance = String(currentFormat?.Balance ?? "").trim() != ""

    document.querySelector("#reportSalaryCard").classList.toggle("d-none", !hasBalance)

    if (!hasBalance){
        balanceEl.innerHTML = `<p class="report-empty">The format "${escapeHtml(currentFormat?.Title)}" has no Balance column, so there is nothing to show here.</p>`
        return
    }

    const thresholdValue = document.querySelector("#reportBalanceThreshold").value.trim()
    const threshold = thresholdValue === "" ? NaN : Number(thresholdValue)
    const summary = balanceSummary(allRows, from, to, threshold)

    if (summary == null){
        balanceEl.innerHTML = `<p class="report-empty">No transactions in this period.</p>`
        salaryEl.innerHTML = ""
        return
    }

    const belowTile = summary.daysBelow == null
        ? statTile("Days with a low balance", "-", "Enter an amount above")
        : statTile(`Days below ${formatMoney(threshold, 0)}`, `${summary.daysBelow} of ${summary.days}`)

    balanceEl.innerHTML = `<div class="report-stats">` +
        statTile("Opening balance", formatMoney(summary.opening)) +
        statTile("Closing balance", formatMoney(summary.closing), `Change ${summary.closing >= summary.opening ? "+" : "−"}${formatMoney(Math.abs(summary.closing - summary.opening))}`) +
        statTile("Average daily balance", formatMoney(summary.averageBalance)) +
        statTile("Lowest balance", formatMoney(summary.lowest.amount), formatDate(summary.lowest.date)) +
        statTile("Highest balance", formatMoney(summary.highest.amount), formatDate(summary.highest.date)) +
        belowTile +
        `</div>`

    const cycles = salaryCycles(allRows, from, to)

    if (cycles == null){
        salaryEl.innerHTML = `<p class="report-empty">Not enough data: needs at least 3 months with a biggest credit of about the same size, like a salary.</p>`
        return
    }

    const share = `${SALARY_LOW_SHARE * 100}%`
    const lasted = (cycle) => {
        if (cycle.droppedOn) return `${plural(cycle.days, "day")} (under ${share} on ${formatDate(cycle.droppedOn)})`
        if (cycle.nextSalary) return `Stayed above ${share} until the next salary (${plural(cycle.days, "day")})`
        return `Above ${share} so far (${plural(cycle.days, "day")} to the end of the statement)`
    }

    const dropped = cycles.filter(cycle => cycle.droppedOn)
    let verdict = ""
    if (dropped.length > 0){
        const averageDays = Math.round(dropped.reduce((total, cycle) => total + cycle.days, 0) / dropped.length)
        verdict = `<p class="report-total">The balance fell under ${share} of the salary <b>${plural(averageDays, "day")}</b> after it arrived, on average (${dropped.length} of ${plural(cycles.length, "cycle")}).</p>`
    }else if (cycles.length > 0){
        verdict = `<p class="report-total">The balance stayed above ${share} of the salary in every cycle.</p>`
    }

    salaryEl.innerHTML = reportTable([
        dateColumn(cycle => cycle.date),
        moneyColumn("Salary", cycle => cycle.amount),
        { title: "Lasted", value: cycle => escapeHtml(lasted(cycle)) }
    ], cycles, "No salary was credited in this period.") + verdict
}

const checkItem = (ok, text, details = "") =>
    `<li><i class="fa-solid ${ok ? "fa-circle-check text-success" : "fa-triangle-exclamation text-warning"} mt-1"></i><div>${text}${details}</div></li>`

function renderDataQuality(allRows, rangeRows, from, to) {
    const items = []

    if (String(currentFormat?.Balance ?? "").trim() != ""){
        // Checked over the whole statement, the first row of the range needs the row before it
        const mismatches = findBalanceMismatches(allRows).filter(mismatch => inDateRange([mismatch.row], from, to).length > 0)

        if (mismatches.length === 0){
            items.push(checkItem(true, "Every balance in this period follows from the row before it."))
        }else{
            const mismatchTable = limitedTable([
                dateColumn(item => item.row.TranDate),
                { title: "Detail", value: item => detailCell(rowLabel(item.row)) },
                moneyColumn("Expected", item => item.expected),
                moneyColumn("In statement", item => item.row.Balance),
                moneyColumn("Difference", item => item.difference)
            ], mismatches, "")
            items.push(checkItem(false, `<b>${plural(mismatches.length, "row")}</b> where the balance isn't the balance before plus credit minus debit. ` +
                "This usually means a row is missing from the file, or a column in the format is mapped wrong.", `<div class="mt-2">${mismatchTable}</div>`))
        }
    }else{
        items.push(checkItem(false, "Balances can't be checked because the format has no Balance column."))
    }

    if (lastSkipped > 0){
        items.push(checkItem(false, `<b>${plural(lastSkipped, "row")}</b> of the file were skipped because their date couldn't be read. ` +
            "This counts the whole file, since those rows have no date to place them in a period."))
    }else{
        items.push(checkItem(true, "Every row of the file had a readable date."))
    }

    const spend = summarize(rangeRows).totalDebit
    const uncategorized = rangeRows.filter(row => row.Debit > 0 && row.Category === UNCATEGORIZED)
    const uncategorizedSpend = summarize(uncategorized).totalDebit
    const share = spend > 0 ? Math.round(uncategorizedSpend / spend * 100) : 0
    items.push(checkItem(share < 20,
        `<b>${share}%</b> of spending in this period is Uncategorized (${plural(uncategorized.length, "debit")}, ${formatMoney(uncategorizedSpend)}).` +
        (share >= 20 ? " Category figures will be less reliable." : "")))

    const excluded = inDateRange(allRows, from, to).filter(row => excludedDetails.includes(row.TranDetail)).length
    if (excluded > 0){
        items.push(checkItem(true, `${plural(excluded, "transaction")} in this period ${excluded == 1 ? "is" : "are"} excluded from calculation on the Dashboard and left out of the spending sections.`))
    }

    document.querySelector("#reportDataQuality").innerHTML = items.join("")
}

async function saveReportPdf() {
    if (!hasStatement()){
        window.api.showError("Load a statement on the Dashboard first.");
        return
    }

    const from = document.querySelector("#reportFromDate").value
    const to = document.querySelector("#reportToDate").value

    const result = await window.api.saveReportPdf(`Croco-Report_${from}_to_${to}.pdf`)

    if (result.error){
        window.api.showError(`Could not save the PDF: ${result.error}`);
        return
    }
    if (result.saved){
        displayGreenToast("Report saved", 2000)
    }
}
