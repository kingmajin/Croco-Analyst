// This is script file what else?

let filePath = null
let table
let formatTable

// Format used for the statement that is currently loaded
let currentFormat = null

// Every transaction of the loaded statement oldest first, and how many rows had no readable date.
// The report works on these, whatever the table is filtered or sorted by.
let loadedTransactions = []
let lastSkipped = 0

let legends = {
    availableBalance: 0,
    totalCredited: 0,
    expenseInDate: 0,
    averageDailyExpense: 0,
    averageMonthlyExpense: 0
}

// Filters from the last "Apply Filter", rows excluded from calculation are kept separately
// so applying a filter doesn't bring them back
let appliedFilters = []
let excludedDetails = []

const categoryMatchers = buildCategoryMatchers(categoryMap)

const isOnlyDigits = (str) => /^\d+$/.test(str)

const AMOUNT_FIELDS = ["Debit", "Credit", "Balance"]

// Buttons and links use data-action="name" instead of onclick so the page can run under a strict CSP
const actions = {
    switchPage: (element) => switchPage(element),
    openAbout: () => window.api.openAbout(),
    selectFile: () => selectFile(),
    uploadConfirm: () => uploadConfirm(),
    filterDataTable: () => filterDataTable(),
    clearFilterofDataTable: () => clearFilterofDataTable(),
    displayCharts: (element) => displayCharts(element),
    addFormat: () => addFormat(),
    clearAddFormatForm: () => clearAddFormatForm(),
    updateFormat: () => updateFormat(),
    cancelEditFormat: () => cancelEditFormat(),
    clearFormats: () => clearFormats(),
    clearAllTag: () => clearAllTag(),
    assignTag: () => assignTag(),
    applyReportFilter: () => applyReportFilter(),
    applyReportPreset: (element) => applyReportPreset(element),
    saveReportPdf: () => saveReportPdf()
}

document.addEventListener("click", function (event) {
    const element = event.target.closest("[data-action]")
    if (!element || !actions[element.dataset.action]) {
        return
    }

    Promise.resolve(actions[element.dataset.action](element)).catch(err => {
        console.error(err)
        window.api.showError(`Something went wrong: ${err.message}`)
    })
});

document.addEventListener("DOMContentLoaded", function () {
    loadModals()
    loadFormats()
    addCheckboxRule()
    displayAllFormats()
    loadSelectCategoryFilter()
    loadSelectTagFilter()
});

// Charts are sized to the window, so draw them again once resizing stops
let resizeTimer
window.addEventListener("resize", function () {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(refreshCharts, 250)
});

async function loadModals() {
    const response = await fetch("modals.html")
    document.getElementById("modal-container").innerHTML = await response.text()
}

async function loadFormats() {
    const data = await getFormats();
    const select = document.querySelector("#selectFormatCB");
    const selectedTitle = select.value

    select.innerHTML = "<option selected>Select Format</option>";
    data.forEach(item => {
        const option = document.createElement("option");
        option.value = item.Title;
        option.textContent = item.Title;
        select.appendChild(option);
    });

    if (data.some(item => item.Title == selectedTitle)){
        select.value = selectedTitle
    }
}

async function addCheckboxRule() {
    const toRowCheckbox = document.getElementById("toRowNoCheck");
    toRowCheckbox.addEventListener("change", function () {
        let input = document.getElementById("formattoRowNo");
        input.value = ""
        input.disabled = this.checked;
    });

    const splitTranCheckbox = document.getElementById("splitTranDet");
    splitTranCheckbox.addEventListener("change", function () {
        showSplitTranFields(this.checked)
    });

    document.getElementById("excludeUncategorized").addEventListener("change", refreshCharts);
}

function showSplitTranFields(show) {
    if (show){
        document.getElementById("splitTranDiv").style.opacity = "1"
        document.getElementById("splitTranDiv").style.overflow = "visible"
        document.getElementById("splitTranDiv").style.height = "130px"
    }else{
        document.getElementById("splitTranDiv").style.opacity = "0"
        document.getElementById("splitTranDiv").style.overflow = "hidden"
        document.getElementById("splitTranDiv").style.height = "0"
    }
}

async function loadSelectCategoryFilter() {

    if (categoryMap == null || categoryMap == undefined){
        return
    }
    let categoryList = [...Object.keys(categoryMap), UNCATEGORIZED];

    const categorySelect = document.querySelector("#selectCategory");

    categorySelect.innerHTML = "<option selected>Select Category</option>";
    categoryList.forEach(item => {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = item;
        categorySelect.appendChild(option);
    });
}

async function loadSelectTagFilter() {
    const tagMap = await window.api.getTags();

    // Many sources can share one tag, list each tag once
    let tagList = [...new Set(Object.values(tagMap))].sort();

    const tagSelect = document.querySelector("#selectTag");
    const selectedTag = tagSelect.value

    tagSelect.innerHTML = "<option selected>Select Tag</option>";
    tagList.forEach(item => {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = item;
        tagSelect.appendChild(option);
    });

    if (tagList.includes(selectedTag)){
        tagSelect.value = selectedTag
    }
}

const pages = {
    dashboard: ".main-container",
    format: ".format-container",
    report: ".report-container"
}

async function switchPage(selectedNav){
    const page = selectedNav.dataset.page

    if (!pages[page]){
        console.log("Not a valid page")
        return
    }

    const pageNavigationDiv = document.querySelector("#pageNavigation")
    const navigationElements = pageNavigationDiv.querySelectorAll('p');
    navigationElements.forEach((p, index) => {
        p.classList.remove('active')
    });
    selectedNav.classList.add('active');

    for (const [name, selector] of Object.entries(pages)) {
        document.querySelector(selector).style.display = name == page ? "" : "none"
    }

    // Tags and exclusions may have changed on the dashboard since the report was drawn
    if (page == "report"){
        renderReport()
    }
}

// One Bootstrap instance per toast, hiding is timed here so every message can have its own delay
const toastTimers = new Map()

function showToast(toastEl, message, delay) {
    toastEl.innerText = message
    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { autohide: false })
    toast.show();

    clearTimeout(toastTimers.get(toastEl))
    toastTimers.set(toastEl, setTimeout(() => toast.hide(), delay))
}

async function displayGreenToast(message, delay = 1200) {
    showToast(document.getElementById('myGreenToast'), message, delay)
}

async function displayRedToast(message, delay = 1200) {
    showToast(document.getElementById('myRedToast'), message, delay)
}

async function selectFile(){

    const selectedPath = await window.api.selectFile();

    // Cancelling the dialog keeps the file that was already selected
    if (!selectedPath) {
        return;
    }

    filePath = selectedPath

    const fileName = filePath.split(/[\\/]/).pop();

    document.querySelector("#selectedFileName").textContent = fileName

}

async function uploadConfirm(){

    // Validate file
    if (!filePath) {
        window.api.showError("File is not selected");
        return;
    }

    const selectedFormatValue = document.getElementById("selectFormatCB").value;

    if (selectedFormatValue == "Select Format" || selectedFormatValue == "" ){
        window.api.showError("Format not selected. Please upload the format of your statement from Add format if not already done.");
        return
    }

    let mapData = await getFormats();

    const selectedFormat = mapData.find(element => element.Title == selectedFormatValue)

    if (!selectedFormat){
        window.api.showError("The selected format no longer exists. Please select another one.");
        return
    }

    if (String(selectedFormat.TranDate ?? "").trim() == ""){
        window.api.showError(`The format "${selectedFormat.Title}" has no Tran. Date column. Please add the format again with the date column filled in.`);
        return
    }

    const toRow = selectedFormat.isTillEnd == "true" ? -1 : selectedFormat.ToRowNo

    const result = await window.api.readExcel(filePath, selectedFormat.FromRowNo, toRow);

    if (result.error){
        window.api.showError(result.error);
        return
    }

    const missingColumns = findMissingColumns(result.headers, selectedFormat)
    if (missingColumns.length > 0){
        window.api.showError(`These columns of the format "${selectedFormat.Title}" were not found in row ${selectedFormat.FromRowNo} of the file:\n\n${missingColumns.join("\n")}\n\nColumns found: ${result.headers.join(", ")}`);
        return
    }

    await populateData(result.records, selectedFormat)

}

function formatCell(cell) {
    let field = cell.getField();
    let value = cell.getValue();

    if (AMOUNT_FIELDS.includes(field)){
        return value.toFixed(2)
    }
    if(field == "SrcTag" && value != ""){
        return `<span class="tagStyle">${escapeHtml(value)}</span>`;
    }
    return escapeHtml(value);
}

async function populateData(records, selectedFormat){

    if (!records || records.length === 0) {
        window.api.showError("No data found");
        return;
    }

    const tagMap = await window.api.getTags()

    const { transactions, skipped } = buildTransactions(records, selectedFormat, tagMap, categoryMatchers)

    if (transactions.length === 0) {
        window.api.showError(`No rows with a valid date were found in the "${selectedFormat.TranDate}" column (${skipped} rows skipped).`);
        return;
    }

    currentFormat = selectedFormat
    loadedTransactions = transactions
    lastSkipped = skipped
    const isSplit = selectedFormat.IsSplitTran == "true"

    const keyFieldMap = {
        TranDate: "Date",
        ChequeNo: "Cheque No.",
        TranDetail: "Transaction Detail",
        Debit: "Debit",
        Credit: "Credit",
        Balance: "Balance",
        TranNo: "T. Number",
        TranSource: "T. Source",
        SrcTag: "Tag",
        Category: "Category"
    };

    // Show the columns the format maps, plus the split columns when it splits the details
    const visibleFields = [
        ...MAPPED_FIELDS.filter(field => String(selectedFormat[field] ?? "").trim() != ""),
        ...(isSplit ? ["TranNo", "TranSource", "SrcTag"] : []),
        "Category"
    ]

    const columns = visibleFields
        .map(key => ({
            title: keyFieldMap[key],
            field: key,
            width: (key == "TranDetail") ? 230 : ((key == "TranSource") ? 200 : 115),
            formatter: formatCell
        }));

    // Assign coloring not a good approach bit please dont judge
    columns.forEach(column => {
        if (column.field == "Category"){
            column["cssClass"] = "categoryColumn"
        }
        if ((column.field == "Debit")){
            column["cssClass"] = "debitColumn"
        }
        if ((column.field == "Credit")){
            column["cssClass"] = "creditColumn"
        }
    });

    resetFilterInputs()
    appliedFilters = []
    excludedDetails = []

    // Balance of the latest transaction, it stays the same while filtering
    const hasBalance = String(selectedFormat.Balance ?? "").trim() != ""
    legends.availableBalance = hasBalance ? transactions[transactions.length - 1].Balance.toFixed(2) : "-"

    // Destroy old table if existss
    if (table) {
        table.destroy();
    }

    // Create new table
    table = new Tabulator("#data-table", {
        data: transactions,
        columns: columns,
        height: "100%",
        layout: "fitData",
        rowContextMenu:[
            {
                label:"Add tag to the source",
                action:function(e, row){

                    let selectedtranSource = row.getData().TranSource

                    if (!canTagSource(selectedtranSource)){
                        return
                    }

                    document.querySelector("#assignTagKey").value = selectedtranSource
                    document.querySelector("#assignTagInput").value = ""

                    bootstrap.Modal.getOrCreateInstance(document.getElementById('assignTagModal')).show();
                }
            },
            {
                label:"Remove tag from the source",
                action:function(e, row){
                    let selectedRowTag = row.getData().TranSource

                    if (!canTagSource(selectedRowTag)){
                        return
                    }

                    removeTag(selectedRowTag)
                }
            },
            {
                label:"Exclude from calculation",
                action:function(e, row){
                    excludeRow(row.getData().TranDetail)
                }
            }
        ]
    });

    table.on("tableBuilt", refreshAnalysis)

    resetReport()

    if (skipped > 0){
        displayRedToast(`${skipped} row(s) skipped because the date could not be read`, 5000)
    }
}

// Tags are stored against the transaction source, which only exists when the format splits the details
function canTagSource(tranSource) {
    if (currentFormat?.IsSplitTran != "true"){
        window.api.showError(`Tags work on the transaction source. Turn on "Split transaction details" in the format "${currentFormat?.Title}" to use them.`);
        return false
    }
    if (tranSource == ""){
        window.api.showError("This transaction has no source to tag.");
        return false
    }
    return true
}

// Reads the format form and checks it. Returns the mapping without Sno, or null after showing an error.
// ignoreSno is the format being edited, so it doesn't count as a duplicate of itself.
async function readFormatForm(ignoreSno = null){

    const title = document.querySelector("#formatTitle").value.trim()
    const fromRowNo = document.querySelector("#formatfromRowNo").value.trim()
    const toRowNo = document.querySelector("#formattoRowNo").value.trim()
    const isTillEnd = document.querySelector("#toRowNoCheck")
    const tranDate = document.querySelector("#formatTransactionDate").value.trim()
    const chequeNo = document.querySelector("#formatChequeNo").value.trim()
    const tranDetail = document.querySelector("#formatTransactionDetails").value.trim()
    const isSplitTran = document.querySelector("#splitTranDet")
    // not trimmed, a space can be the separator
    const sepetator = document.querySelector("#inputSeperator").value
    const tranNoIndex = document.querySelector("#inputIndexTran").value.trim()
    const tranSourceIndex = document.querySelector("#inputIndexTranSrc").value.trim()
    const debit = document.querySelector("#formatDebit").value.trim()
    const credit = document.querySelector("#formatCredit").value.trim()
    const balance = document.querySelector("#formatBalance").value.trim()

    let maps = await getFormats();

    if (title == ""){
        window.api.showError("Title cannot be empty");
        return null;
    }

    if (maps.some(item => item.Sno !== ignoreSno && String(item.Title).toLowerCase() == title.toLowerCase())){
        window.api.showError(`A format called "${title}" already exists`);
        return null;
    }

    if (!isOnlyDigits(fromRowNo)){
        window.api.showError("From is not a valid number");
        return null;
    }

    if (!isTillEnd.checked){
        if (!isOnlyDigits(toRowNo)){
            window.api.showError("To is not a valid number");
            return null;
        }
    }

    if (tranDate == ""){
        window.api.showError("Tran. Date column cannot be empty");
        return null;
    }

    if (debit == "" && credit == ""){
        window.api.showError("Map at least one of the Debit or Credit columns");
        return null;
    }

    if (isSplitTran.checked){
        if (tranDetail == ""){
            window.api.showError("Details column cannot be empty when splitting transaction details");
            return null;
        }
        if (sepetator == "" || tranNoIndex == "" || tranSourceIndex == ""){
            window.api.showError("Separator, Transaction no. index and transaction source index cannot be empty");
            return null;
        }
        if (!isOnlyDigits(tranNoIndex) || !isOnlyDigits(tranSourceIndex)){
            window.api.showError("Transaction no. index and transaction source must be number");
            return null;
        }
    }

    // Seperator keeps its old spelling so formats saved earlier still load
    return {
        Title: title,
        FromRowNo: fromRowNo,
        ToRowNo: toRowNo,
        isTillEnd: isTillEnd.checked ? "true" : "false",
        TranDate: tranDate,
        ChequeNo: chequeNo,
        TranDetail: tranDetail,
        IsSplitTran: isSplitTran.checked ? "true" : "false",
        Seperator:  isSplitTran.checked ? sepetator : "",
        TranNoIndex: isSplitTran.checked ? tranNoIndex : "",
        TranSourceIndex: isSplitTran.checked ? tranSourceIndex : "",
        Debit: debit,
        Credit: credit,
        Balance: balance
    };
}

async function addFormat(){

    const formValues = await readFormatForm()
    if (formValues == null){
        return
    }

    let maps = await getFormats();

    let Sno = 0

    if (maps.length < 1){
        Sno = 1
    }else{
        Sno = maps[maps.length-1].Sno + 1
    }

    maps.push({ Sno: Sno, ...formValues })

    // Save
    await window.api.saveMappings(maps);

    displayGreenToast("Saved Successfully!")

    clearAddFormatForm()
    displayAllFormats()
    loadFormats()
}

// Sno of the format being edited, null while the form is adding a new one
let editingFormatSno = null

async function editFormat(format){

    clearAddFormatForm()

    document.querySelector("#formatTitle").value = format.Title ?? ""
    document.querySelector("#formatfromRowNo").value = format.FromRowNo ?? ""
    document.querySelector("#formatTransactionDate").value = format.TranDate ?? ""
    document.querySelector("#formatChequeNo").value = format.ChequeNo ?? ""
    document.querySelector("#formatTransactionDetails").value = format.TranDetail ?? ""
    document.querySelector("#inputSeperator").value = format.Seperator ?? ""
    document.querySelector("#inputIndexTran").value = format.TranNoIndex ?? ""
    document.querySelector("#inputIndexTranSrc").value = format.TranSourceIndex ?? ""
    document.querySelector("#formatDebit").value = format.Debit ?? ""
    document.querySelector("#formatCredit").value = format.Credit ?? ""
    document.querySelector("#formatBalance").value = format.Balance ?? ""

    const isTillEnd = format.isTillEnd == "true"
    document.querySelector("#toRowNoCheck").checked = isTillEnd
    document.querySelector("#formattoRowNo").disabled = isTillEnd
    document.querySelector("#formattoRowNo").value = isTillEnd ? "" : (format.ToRowNo ?? "")

    document.querySelector("#splitTranDet").checked = format.IsSplitTran == "true"
    showSplitTranFields(format.IsSplitTran == "true")

    setFormatFormMode(format.Sno)
}

async function updateFormat(){

    const formValues = await readFormatForm(editingFormatSno)
    if (formValues == null){
        return
    }

    let maps = await getFormats();

    const index = maps.findIndex(item => item.Sno === editingFormatSno)
    if (index == -1){
        window.api.showError("This format no longer exists.");
        cancelEditFormat()
        return
    }

    const oldTitle = maps[index].Title
    maps[index] = { Sno: editingFormatSno, ...formValues }

    // Save
    await window.api.saveMappings(maps);

    displayGreenToast("Updated Successfully!")

    // Keep the dashboard pointing at this format if it was selected there
    const formatSelect = document.querySelector("#selectFormatCB")
    const wasSelected = formatSelect.value == oldTitle

    cancelEditFormat()
    displayAllFormats()
    await loadFormats()

    if (wasSelected){
        formatSelect.value = formValues.Title
    }
}

async function cancelEditFormat(){
    clearAddFormatForm()
    document.querySelector("#splitTranDet").checked = false
    showSplitTranFields(false)
    setFormatFormMode(null)
}

// Switches the form between adding a new format and editing an existing one
function setFormatFormMode(sno){
    editingFormatSno = sno
    const isEditing = sno != null

    document.querySelector("#formatFormTitle").textContent = isEditing ? "Edit a Format" : "Add a Format"
    document.querySelector("#addFormatButtons").classList.toggle("d-none", isEditing)
    document.querySelector("#editFormatButtons").classList.toggle("d-none", !isEditing)
}

async function getFormats(){
    const mappings = await window.api.getMappings();
    return Array.isArray(mappings) ? mappings : []
}

async function clearFormats(){
    const confirmed = await window.api.confirm("Delete all saved formats? This cannot be undone.", "Delete all")
    if (!confirmed){
        return
    }

    // Clear
    await window.api.saveMappings([]);
    if (editingFormatSno != null){
        cancelEditFormat()
    }
    displayAllFormats()
    loadFormats()
}

async function deleteFormat(id, title){

    const confirmed = await window.api.confirm(`Delete the format "${title}"? This cannot be undone.`, "Delete")
    if (!confirmed){
        return
    }

    const maps = await getFormats();

    const updatedMaps = maps.filter(item => item.Sno !== id);

    await window.api.saveMappings(updatedMaps);

    displayRedToast("Deleted a format!")

    if (id === editingFormatSno){
        cancelEditFormat()
    }

    displayAllFormats()
    loadFormats()
}

async function clearAddFormatForm(){

    document.querySelector("#formatTitle").value = ""
    document.querySelector("#formatfromRowNo").value = ""
    document.querySelector("#formattoRowNo").value = ""
    document.querySelector("#formattoRowNo").disabled = false
    document.querySelector("#toRowNoCheck").checked = false
    document.querySelector("#formatTransactionDate").value = ""
    document.querySelector("#formatChequeNo").value = ""
    document.querySelector("#formatTransactionDetails").value = ""
    // document.querySelector("#splitTranDet").checked = false
    document.querySelector("#inputSeperator").value = ""
    document.querySelector("#inputIndexTran").value = ""
    document.querySelector("#inputIndexTranSrc").value = ""
    document.querySelector("#formatDebit").value = ""
    document.querySelector("#formatCredit").value = ""
    document.querySelector("#formatBalance").value = ""

}

async function displayAllFormats(){

    document.querySelector("#viewFormatSpinner").style.display = "flex"

    let data = await getFormats();

    // Destroy old table if existss
    if (formatTable) {
        formatTable.destroy();
    }

    formatTable = new Tabulator("#view-format-table", {
        data: data,
        // selectableRows:true,
        columns:[
            {title:"S.no.", field:"Sno"},
            {title:"Title", field:"Title"},
            {title:"From Row No", field:"FromRowNo"},
            {title:"To Row No", field:"ToRowNo"},
            {title: "Action", headerSort: false, formatter: () =>
                `<i style="color: #0d6efd; cursor: pointer;" class="fa-solid fa-pen-to-square fs-5 me-3" data-format-action="edit" title="Edit"></i>` +
                `<i style="color: #bd0000; cursor: pointer;" class="fa-solid fa-trash-can fs-5" data-format-action="delete" title="Delete"></i>`,
                cellClick: function (e, cell) {
                    const rowData = cell.getRow().getData();
                    const formatAction = e.target.closest("[data-format-action]")?.dataset.formatAction

                    if (formatAction == "edit"){
                        editFormat(rowData);
                    }
                    if (formatAction == "delete"){
                        deleteFormat(rowData.Sno, rowData.Title);
                    }
                }
            }
        ],
        height: "100%"
    });

    document.querySelector("#viewFormatSpinner").style.display = "None"
}

async function filterDataTable(){

    if (table == null){
        return
    }

    let fromDateRange = document.querySelector("#fromDateRange").value
    let toDateRange = document.querySelector("#toDateRange").value
    let fromAmt = document.querySelector("#fromAmtRange").value.trim()
    let toAmt = document.querySelector("#toAmtRange").value.trim()
    let selectAmtFlterType = document.querySelector("#selectAmtFilter").value
    let selectCategory = document.querySelector("#selectCategory").value
    let selectTag = document.querySelector("#selectTag").value

    if ((fromAmt != "" && isNaN(Number(fromAmt))) || (toAmt != "" && isNaN(Number(toAmt)))){
        window.api.showError("Min and Max amount must be numbers");
        return
    }

    let tableFilter = []

    // Dates are stored as YYYY-MM-DD, the same as the date inputs, so they compare as text
    if (fromDateRange != ""){
        tableFilter.push({ field: "TranDate", type: ">=", value: fromDateRange })
    }
    if (toDateRange != ""){
        tableFilter.push({ field: "TranDate", type: "<=", value: toDateRange })
    }
    if (fromAmt != ""){
        tableFilter.push({ field: selectAmtFlterType, type: ">=", value: Number(fromAmt) })
    }
    if (toAmt != ""){
        tableFilter.push({ field: selectAmtFlterType, type: "<=", value: Number(toAmt) })
    }
    if (selectCategory != "Select Category" && selectCategory != ""){
        tableFilter.push({ field: "Category", type: "=", value: selectCategory })
    }
    if (selectTag != "Select Tag" && selectTag != ""){
        tableFilter.push({ field: "SrcTag", type: "=", value: selectTag })
    }

    appliedFilters = tableFilter
    applyTableFilters()
}

function applyTableFilters() {
    const exclusions = excludedDetails.map(detail => ({ field: "TranDetail", type: "!=", value: detail }))
    table.setFilter([...appliedFilters, ...exclusions]);
    refreshAnalysis()
}

function resetFilterInputs() {
    document.querySelector("#fromDateRange").value = ""
    document.querySelector("#toDateRange").value = ""
    document.querySelector("#fromAmtRange").value = ""
    document.querySelector("#toAmtRange").value = ""
    document.querySelector("#selectAmtFilter").selectedIndex = 0
    document.querySelector("#selectCategory").selectedIndex = 0
    document.querySelector("#selectTag").selectedIndex = 0
}

async function clearFilterofDataTable(){
    resetFilterInputs()

    appliedFilters = []
    excludedDetails = []

    if (table == null){
        return
    }
    table.clearFilter();
    table.clearSort();

    refreshAnalysis()
}

// Rows the table currently shows, oldest first whatever column the table is sorted by
function activeRows() {
    return table == null ? [] : sortByDate(table.getData("active"))
}

function refreshAnalysis() {
    const rows = activeRows()
    calculateLegends(rows)
    displayAllCharts(rows)
}

function refreshCharts() {
    displayAllCharts(activeRows())
}

async function calculateLegends(data) {

    const summary = summarize(data)

    // Calculating and assigning total amount credited in date range
    legends.totalCredited = summary.totalCredit.toFixed(2)

    // Assigning Expense in Date Range
    legends.expenseInDate = summary.totalDebit.toFixed(2)

    // Average over the days / months that have transactions
    legends.averageDailyExpense = summary.averageDaily.toFixed(2)
    legends.averageMonthlyExpense = summary.averageMonthly.toFixed(2)

    await assignLegends()
}

async function assignLegends() {
    document.querySelector("#balanceAmount").textContent = legends.availableBalance
    document.querySelector("#totalCredited").textContent = legends.totalCredited
    document.querySelector("#expenseAmount").textContent = legends.expenseInDate
    document.querySelector("#avgDailyExp").textContent = legends.averageDailyExpense
    document.querySelector("#avgMonthlyExp").textContent = legends.averageMonthlyExpense
}

async function assignTag() {

    let assignedKey = document.querySelector("#assignTagKey").value.trim()
    let assignedValue = document.querySelector("#assignTagInput").value.trim()

    if (assignedValue == ""){
        window.api.showError("Tag cannot be empty");
        return
    }

    let availableTags = await window.api.getTags();

    availableTags[assignedKey] = assignedValue

    await window.api.setTags(availableTags);

    table.getRows().forEach(row => {
        const data = row.getData();

        if (data.TranSource === assignedKey) {
            row.update({
                SrcTag: assignedValue
            });
        }
    });
    setLoadedTag(assignedKey, assignedValue)

    loadSelectTagFilter()
}

async function removeTag(key) {

    let availableTags = await window.api.getTags();

    table.getRows().forEach(row => {
    const data = row.getData();

    if (data.TranSource === key.trim()) {
        row.update({
            SrcTag: ""
        });
    }
    });

    setLoadedTag(key.trim(), "")
    delete availableTags[key.trim()];

    await window.api.setTags(availableTags);

    loadSelectTagFilter()
}

// Keeps the report's copy of the statement in step with the table
function setLoadedTag(tranSource, tag) {
    loadedTransactions.forEach(transaction => {
        if (transaction.TranSource === tranSource) {
            transaction.SrcTag = tag
        }
    });
}

async function clearAllTag(key) {

    let availableTags = {}
    await window.api.setTags(availableTags);
}

async function excludeRow(rowTranDetail){
    if (table == null){
        return
    }

    excludedDetails.push(rowTranDetail)
    applyTableFilters()
}

async function displayCharts(source) {
    const dataDiv = document.getElementById('data-table')
    const chartDiv = document.getElementById('data-charts')

    if (dataDiv.style.display != "none"){
        source.innerHTML = 'Show Data<i class="fa-solid fa-table ms-2"></i>'
        chartDiv.style = "display: block"
        dataDiv.style = "display: none;"
    }else{
        source.innerHTML = 'Show Charts<i class="fa-solid fa-chart-line ms-2"></i>'
        chartDiv.style = "display: none"
        dataDiv.style = "display: block;"
    }

    refreshCharts()

}
