// This is script file what else?

let filePath = null
let table
let formatTable

let legends = {
    availableBalance: 0,
    totalCredited: 0,
    expenseInDate: 0,
    averageDailyExpense: 0,
    averageMonthlyExpense: 0
}

let tableFilter=[]

const isOnlyDigits = (str) => /^\d+$/.test(str)

document.addEventListener("DOMContentLoaded", function () {
    loadFormats()
    addCheckboxRule()
    displayAllFormats()
});

async function loadFormats() {
    const data = await getFormats();
    const select = document.querySelector("#selectFormatCB");

    select.innerHTML = "<option selected>Select Format</option>";
    console.log(data)
    data.forEach(item => {
        const option = document.createElement("option");
        option.value = item.Title;
        option.textContent = item.Title;
        select.appendChild(option);
    });
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
        if (this.checked){
            document.getElementById("splitTranDiv").style.opacity = "1"
            document.getElementById("splitTranDiv").style.overflow = "visible"
            document.getElementById("splitTranDiv").style.height = "130px"
        }else{
            document.getElementById("splitTranDiv").style.opacity = "0"
            document.getElementById("splitTranDiv").style.overflow = "hidden"
            document.getElementById("splitTranDiv").style.height = "0"
        }
    });
}

async function switchPage(selectedNav){
    const dashboardPage = document.querySelector(".main-container")
    const addFormatPage = document.querySelector(".format-container")

    const pageNavigationDiv = document.querySelector("#pageNavigation")
    const navigationElements = pageNavigationDiv.querySelectorAll('p');
    navigationElements.forEach((p, index) => {
        p.classList.remove('active')
    });

    let selectedNavText = selectedNav.innerText.trim()

    switch (selectedNavText) {
    case "Dashboard":
        selectedNav.classList.add('active');
        dashboardPage.style.display = "block"
        addFormatPage.style.display = "none"
        break;
    case "Format":
        selectedNav.classList.add('active');
        addFormatPage.style.display = "block"
        dashboardPage.style.display = "none"
        break;
    case "View Format":
        break;
    case "Generate Report":
        break;
    default:
        console.log("Not a valid page")
    }
}

async function displayGreenToast(message) {
    const container = document.querySelector('.toast-container');
    const toastEl = document.getElementById('myGreenToast');
    toastEl.innerText = message
    const toast = new bootstrap.Toast(toastEl, {
        delay: 1200,
        autohide: true
    });
    toast.show();
}

async function displayRedToast(message) {
    const container = document.querySelector('.toast-container');
    const toastEl = document.getElementById('myRedToast');
    toastEl.innerText = message
    const toast = new bootstrap.Toast(toastEl, {
        delay: 1200,
        autohide: true
    });
    toast.show();
}

async function selectFile(){

    filePath = await window.api.selectFile();

    // Validate file
    if (!filePath) {
        filePath = null
        window.api.showError("No file selected");
        document.querySelector("#selectedFileName").innerHTML = "No file selected"
        return;
    }

    const fileName = filePath.split('\\').pop(); 
    const fileExt = fileName.split('.').pop();

    document.querySelector("#selectedFileName").innerHTML = fileName

}

async function uploadConfirm(){

    // Validate file
    if (!filePath) {
        window.api.showError("File is not selected");
        return;
    }

    const selectedFormatValue = document.getElementById("selectFormatCB").value;

    if (selectedFormatValue == ""){
        return
    }

    let mapData = await getFormats();

    let selectedFormat

    mapData.forEach(element => {
        if(element.Title == selectedFormatValue){
            selectedFormat = element
        }
    });

    toRow = selectedFormat.isTillEnd == "true" ? -1 : selectedFormat.ToRowNo

    const result = await window.api.readExcel(filePath, selectedFormat.FromRowNo, toRow);
    
    populateData(result, selectedFormat)

}


async function populateData(data, selectedFormat){

    if (!data || data.length === 0) {
        window.api.showError("No data found");
        return;
    }

    let mappedData = await remapData(data, selectedFormat)
    
    mappedData.forEach(element => {
        if (element.TranDate) {
            element.TranDate = element.TranDate.split("-").reverse().join("-");
        }
    });

    console.log(mappedData)
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

    const columns = Object.entries(mappedData[0])
        .map(([key]) => ({
            title: keyFieldMap[key],
            field: key,
            width: (key == "TranDetail") ? 230 : ((key == "TranSource") ? 200 : 115),
            formatter: function(key) {
                let field = key.getField();
                let value = key.getValue();
                if(field == "SrcTag" && value != ""){
                    return `<span class="tagStyle">${value}</span>`;
                }else{
                    return value;
                }   
            }
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
        
    // Destroy old table if existss
    if (table) {
        table.destroy();
    }

    // Create new table
    table = new Tabulator("#data-table", {
        data: mappedData,
        columns: columns,
        height: "100%",
        layout: "fitData",
        rowContextMenu:[
            {
                label:"Add tag to the source",
                action:function(e, row){

                    let selectedtranSource = row.getData().TranSource

                    document.querySelector("#assignTagKey").value = selectedtranSource

                    bootstrap.Modal.getOrCreateInstance(document.getElementById('assignTagModal')).show();
                }
            },
            {
                label:"Remove tag from the source",
                action:function(e, row){
                    let selectedRowTag = row.getData().TranSource
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

    calculateLegends(mappedData)
    
}

async function addFormat(){

    const title = document.querySelector("#formatTitle").value
    const fromRowNo = document.querySelector("#formatfromRowNo").value
    const toRowNo = document.querySelector("#formattoRowNo").value
    const isTillEnd = document.querySelector("#toRowNoCheck")
    const tranDate = document.querySelector("#formatTransactionDate").value
    const chequeNo = document.querySelector("#formatChequeNo").value
    const tranDetail = document.querySelector("#formatTransactionDetails").value
    const isSplitTran = document.querySelector("#splitTranDet")
    const sepetator = document.querySelector("#inputSeperator").value
    const tranNoIndex = document.querySelector("#inputIndexTran").value
    const tranSourceIndex = document.querySelector("#inputIndexTranSrc").value
    const debit = document.querySelector("#formatDebit").value
    const credit = document.querySelector("#formatCredit").value
    const balance = document.querySelector("#formatBalance").value


    if (!isOnlyDigits(fromRowNo)){
        window.api.showError("From is not a valid number");
        return;
    } 
    
    if (!isTillEnd.checked){
        if (!isOnlyDigits(toRowNo)){
            window.api.showError("To is not a valid number");
            return;
        } 
    }

    if (isSplitTran.checked){
        if (sepetator == "" || tranNoIndex == "" || tranSourceIndex == ""){
            window.api.showError("Seperator, Transaction no. index and transaction source index cannot be empty");
            return;
        } 
        if (!isOnlyDigits(tranNoIndex) || !isOnlyDigits(tranSourceIndex)){
            window.api.showError("Transaction no. index and transaction source must be number");
            return;
        } 
    }

    let maps = await window.api.getMappings();

    if (!Array.isArray(maps)){
        maps = []
    }


    let Sno = 0

    if (maps.length < 1){
        Sno = 1
    }else{
        Sno = maps[maps.length-1].Sno + 1
    }

    const mapping = {
        Sno: Sno,
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

    maps.push(mapping)

    // Save
    await window.api.saveMappings(maps);

    displayGreenToast("Saved Successfully!")

    clearAddFormatForm()
    displayAllFormats()
    loadFormats()
}

async function getFormats(){
    const mappings = await window.api.getMappings();
    return mappings
}

async function clearFormats(){
    // Clear
    await window.api.saveMappings([]);
    displayAllFormats()
    loadFormats()
}

async function deleteFormat(id){
    
    const maps = await window.api.getMappings();

    const updatedMaps = maps.filter(item => item.Sno !== id);

    await window.api.saveMappings(updatedMaps);

    displayRedToast("Deleted a format!")

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

    let data = await window.api.getMappings();

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
            {title: "Action", formatter: () => 
                `<i style="color: #bd0000;" class="fa-solid fa-trash-can fs-5"></i>`,
                cellClick: function (e, cell) {
                    const rowData = cell.getRow().getData();
                    deleteFormat(rowData.Sno);
                }
            }
        ],
        height: "100%"
    });

    document.querySelector("#viewFormatSpinner").style.display = "None"
}

async function remapData(obj, keyMap) {
    
    let newObj = []

    const tagMap =  await window.api.getTags();

    const allowedKeys = ["TranDate", "ChequeNo", "TranDetail", "Debit", "Credit", "Balance"];

    obj.forEach(element => {
        let tempElement = {}
        for (const [key, value] of Object.entries(keyMap)) {
            if (allowedKeys.includes(key)){
                if (Object.hasOwn(element, value)){
                    
                    tempElement[key] = element[value]
                    
                    if (keyMap.IsSplitTran == "true" && key == "TranDetail"){

                        // Seperating the transaction details
                        let tranDetArray = tempElement.TranDetail.split(keyMap.Seperator)
                        let transactionNumber = tranDetArray[Number(keyMap.TranNoIndex) - 1]
                        let transactionSource = tranDetArray[Number(keyMap.TranSourceIndex) - 1] == null ? "" : tranDetArray[Number(keyMap.TranSourceIndex) - 1]
                        tempElement["TranNo"] = transactionNumber
                        tempElement["TranSource"] = transactionSource

                        // Mapping tag data
                        if (tagMap[transactionSource.trim()] != null || tagMap[transactionSource.trim()] != undefined){
                            tempElement["SrcTag"] = tagMap[transactionSource.trim()]
                        }else{
                            tempElement["SrcTag"] = ""
                        }

                        // Maping category data
                        for (let category in categoryMap) {

                            let tempKeysList = categoryMap[category]
                            let tempTrSource = transactionSource.toLowerCase()

                            let catFoundFlag = false
                            tempKeysList.forEach(element => {
                                if(tempTrSource.includes(element)){
                                    catFoundFlag = true
                                }
                            });

                            if (catFoundFlag){
                                tempElement["Category"] = category
                                break
                            }else{
                                tempElement["Category"] = ""
                            }
                        }
                    }
                } 
            }
        }
        
        newObj.push(tempElement)
    });

    return newObj
}

async function filterDataTable(){
    
    tableFilter = []

    if (table != null){
        let fromDateRange = document.querySelector("#fromDateRange").value
        let toDateRange = document.querySelector("#toDateRange").value
        let fromAmt = document.querySelector("#fromAmtRange").value
        let toAmt = document.querySelector("#toAmtRange").value
        let selectAmtFlterType = document.querySelector("#selectAmtFilter").value

        debugger
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

        table.setFilter(tableFilter);
    }

    recalculateLegends()
}

async function clearFilterofDataTable(){
    document.querySelector("#fromDateRange").value = ""
    document.querySelector("#toDateRange").value = ""
    document.querySelector("#fromAmtRange").value = ""
    document.querySelector("#toAmtRange").value = ""
    
    tableFilter = []

    if (table != null){
        table.clearFilter();
        table.clearSort();
    }
    recalculateLegends()
    console.log(await window.api.getTags()) //jojo
}

async function calculateLegends(data) {

    let initExpense = 0
    let temptotalCredit = 0

    // Doing some calculations JK
    let currMonth = 0
    let totalMonths = 0
    let currDay = 0
    let totalDays = 0

    data.forEach(element => {
        let parsingMonth = element.TranDate.split("-")[1]
        let parsingDay = element.TranDate.split("-")[2]

        // This part is calculating total expense in date range
        initExpense += Number(element.Debit)
        
        // This part is calculating total credited in date range
        temptotalCredit += Number(element.Credit)

        // This part is calculating the number of months in date range
        if (currMonth != parsingMonth){
            currMonth = parsingMonth
            totalMonths += 1
        } 

        // This part is calculating the number of days in date range
        if (currDay != parsingDay){
            currDay = parsingDay
            totalDays += 1
        } 
    });

    // Calculate the current balance and assigning
    legends.availableBalance = legends.availableBalance == 0 ? data[data.length -1].Balance : legends.availableBalance

    // Calculating and assigning total amount credited in date range
    legends.totalCredited = temptotalCredit.toFixed(2)

    // Assigning Expense in Date Range
    legends.expenseInDate = initExpense.toFixed(2)

    // Calculating and assigning average daily expense 
    legends.averageDailyExpense = (initExpense / (totalDays == 0 ? 1 : totalDays)).toFixed(2)

    // Calculating and assigning monthly expense
    legends.averageMonthlyExpense = (initExpense / (totalMonths == 0 ? 1 : totalMonths)).toFixed(2)

    await assignLegends()
}

async function assignLegends() {
    document.querySelector("#balanceAmount").innerHTML = legends.availableBalance
    document.querySelector("#totalCredited").innerHTML = legends.totalCredited
    document.querySelector("#expenseAmount").innerHTML = legends.expenseInDate
    document.querySelector("#avgDailyExp").innerHTML = legends.averageDailyExpense
    document.querySelector("#avgMonthlyExp").innerHTML = legends.averageMonthlyExpense
}

async function recalculateLegends() {
    const filteredData = table.getData("active");
    calculateLegends(filteredData)
}

async function assignTag() {

    let assignedKey = document.querySelector("#assignTagKey").value.trim()
    let assignedValue = document.querySelector("#assignTagInput").value.trim()
    
    let availableTags = await window.api.getTags();

    if (availableTags == undefined || availableTags == null){
        availableTags = {}
    }
    
    availableTags[assignedKey] = assignedValue

    await window.api.setTags(availableTags);

    table.getRows().forEach(row => {
    const data = row.getData();

    if (data.TranSource.trim() === assignedKey) {
        row.update({
            SrcTag: assignedValue
        });
    }
    });

}

async function removeTag(key) {

    let availableTags = await window.api.getTags();

    if (availableTags == undefined || availableTags == null){
        availableTags = {}
    }

    table.getRows().forEach(row => {
    const data = row.getData();

    if (data.TranSource.trim() === key.trim()) {
        row.update({
            SrcTag: ""
        });
    }
    });

    delete availableTags[key.trim()];

    await window.api.setTags(availableTags);

}

async function clearAllTag(key) {

    let availableTags = {}
    await window.api.setTags(availableTags);
}

async function excludeRow(rowTranDetail){
    if (table != null){
        tableFilter.push({ field: "TranDetail", type: "!=", value: rowTranDetail })
    }
    
    table.setFilter(tableFilter);
    recalculateLegends()
}
