// This is script file what else?

let filePath = null
let table

let legends = {
    availableBalance: 0,
    expenseInDate: 0,
    averageDailyExpense: 0,
    averageMonthlyExpense: 0
}

const isOnlyDigits = (str) => /^\d+$/.test(str)

document.addEventListener("shown.bs.modal", async function (event) {

    if (event.target.id === "addFormatModal") {

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
                document.getElementById("splitTranDiv").style.height = "60px"
            }else{
                document.getElementById("splitTranDiv").style.opacity = "0"
                document.getElementById("splitTranDiv").style.overflow = "hidden"
                document.getElementById("splitTranDiv").style.height = "0"
            }
        });


    }
});

document.addEventListener("shown.bs.modal", async function (event) {
    if (event.target.id === "uploadSheetModal") {

        const data = await getFormats();
        const select = document.querySelector("#selectFormatCB");

        select.innerHTML = "<option selected>Select Format</option>";

        data.forEach(item => {
            const option = document.createElement("option");
            option.value = item.Title;
            option.textContent = item.Title;
            select.appendChild(option);
        });
    }
});

document.addEventListener("shown.bs.modal", async function (event) {
  if (event.target.id === "viewFormatModal") {
    document.querySelector("#viewFormatSpinner").style.display = "None"
    await displayAllFormats()
  }
});

async function selectFile(){

    filePath = await window.api.selectFile();

    // Validate file
    if (!filePath) {
        filePath = null
        window.api.showError("No file selected");
        return;
    }

}

const clearSelectFileModal = () => {
    filePath = null
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
    
    console.log("Parsed Data:", result);
    
    populateData(result, selectedFormat)

    clearSelectFileModal()

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

    const keyFieldMap = {
        TranDate: "Date", 
        ChequeNo: "Cheque No.", 
        TranDetail: "Transaction Detail", 
        Debit: "Debit", 
        Credit: "Credit", 
        Balance: "Balance",
        TranNo: "T. Number",
        TranSource: "T. Source"
    };

    const columns = Object.entries(mappedData[0])
        .map(([key]) => ({
            title: keyFieldMap[key],
            field: key,
            width: (key == "TranDetail") ? 360 : ((key == "TranSource") ? 200 : 130)
    }));

    // Destroy old table if existss
    if (table) {
        table.destroy();
    }

    // Create new table
    table = new Tabulator("#data-table", {
        data: mappedData,
        columns: columns,
        layout: "fitColumns",
        height: "86vh"
    });

    calculateLegends(mappedData)
    visibleDateRange()
    
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
        if (!isOnlyDigits(sepetator) || !isOnlyDigits(tranNoIndex) || !isOnlyDigits(tranSourceIndex)){
            window.api.showError("Seperator, Transaction no. index and transaction source must be number");
            return;
        } 
    }

    let maps = await window.api.getMappings();

    if (!Array.isArray(maps)){
        maps = []
    }

    const mapping = {
        Title: title,
        FromRowNo: fromRowNo,
        ToRowNo: toRowNo,
        isTillEnd: isTillEnd.checked ? "true" : "false",
        TranDate: tranDate,
        ChequeNo: chequeNo,
        TranDetail: tranDetail,
        IsSplitTran: isSplitTran.checked ? "true" : "false",
        Seperator: sepetator,
        TranNoIndex: tranNoIndex,
        TranSourceIndex: tranSourceIndex,
        Debit: debit,
        Credit: credit,
        Balance: balance
    };

    maps.push(mapping)

    // Save
    await window.api.saveMappings(maps);

    clearAddFormatModal()
}

async function getFormats(){
    const mappings = await window.api.getMappings();
    return mappings
}

async function clearFormats(){
    // Clear
    await window.api.saveMappings([]);
}

async function clearAddFormatModal(){

    document.querySelector("#formatTitle").value = ""
    document.querySelector("#formatfromRowNo").value = ""
    document.querySelector("#formattoRowNo").value = ""
    document.querySelector("#formattoRowNo").disabled = false
    document.querySelector("#toRowNoCheck").checked = false
    document.querySelector("#formatTransactionDate").value = ""
    document.querySelector("#formatChequeNo").value = ""
    document.querySelector("#formatTransactionDetails").value = ""
    document.querySelector("#splitTranDet").checked = false
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

    let formatTable = new Tabulator("#view-format-table", {
        data: data,
        // selectableRows:true,
        columns:[
            {title:"Title", field:"Title"},
            {title:"FromRowNo", field:"FromRowNo"},
            {title:"ToRowNo", field:"ToRowNo"}
        ],
        height: "300px"
    });

    // formatTable.on("rowSelectionChanged", function(data, rows){
    //     console.log(data)
    // });

    document.querySelector("#viewFormatSpinner").style.display = "None"
}

async function visibleDateRange() {
    document.querySelector("#dateRangeContainer").style.display = "flex"
}
async function invisibleDateRange() {
    document.querySelector("#dateRangeContainer").style.display = "none"
}

async function remapData(obj, keyMap) {
    
    let newObj = []

    const allowedKeys = ["TranDate", "ChequeNo", "TranDetail", "Debit", "Credit", "Balance"];

    obj.forEach(element => {
        let tempElement = {}
        for (const [key, value] of Object.entries(keyMap)) {
            if (allowedKeys.includes(key)){
                if (Object.hasOwn(element, value)){
                    
                    tempElement[key] = element[value]
                    
                    if (keyMap.IsSplitTran == "true" && key == "TranDetail"){
                        let tranDetArray = tempElement.TranDetail.split(keyMap.Seperator)
                        let transactionNumber = tranDetArray[Number(keyMap.TranNoIndex) - 1]
                        let transactionSource = tranDetArray[Number(keyMap.TranSourceIndex) - 1]
                        tempElement["TranNo"] = transactionNumber
                        tempElement["TranSource"] = transactionSource
                    }

                } 
            }
        }

        
        newObj.push(tempElement)
    });

    return newObj
}

async function filterByDate(){
    if (table != null){
        let fromDateRange = document.querySelector("#fromDateRange").value
        let toDateRange = document.querySelector("#toDateRange").value

        table.setFilter([
            { field: "TranDate", type: ">=", value: fromDateRange },
            { field: "TranDate", type: "<=", value: toDateRange }
        ]);
    }

    recalculateLegends()
}

async function clearFilterByDate(){
    document.querySelector("#fromDateRange").value = ""
    document.querySelector("#toDateRange").value = ""
    if (table != null){
        table.clearFilter();
        table.clearSort();
    }
    recalculateLegends()
}

async function calculateLegends(data) {

    let initExpense = 0

    // Calculate the current balance and assigning
    legends.availableBalance = legends.availableBalance == 0 ? data[data.length -1].Balance : legends.availableBalance

    // Doing some calculations 
    let currMonth = 0
    let totalMonths = 0
    data.forEach(element => {
        debugger
        let parsingMonth = element.TranDate.split("-")[1]
        initExpense += Number(element.Debit)
        if (currMonth != parsingMonth){
            currMonth = parsingMonth
            totalMonths += 1
        } 
    });

    // Assigning Expense in Date Range
    legends.expenseInDate = initExpense.toFixed(2)

    // Calculating and assigning average daily expense
    legends.averageDailyExpense = (initExpense / data.length).toFixed(2)

    // Calculating and assigning monthly expense
    legends.averageMonthlyExpense = (initExpense / totalMonths).toFixed(2)

    await assignLegends()
}

async function assignLegends() {
    document.querySelector("#balanceAmount").innerHTML = legends.availableBalance
    document.querySelector("#expenseAmount").innerHTML = legends.expenseInDate
    document.querySelector("#avgDailyExp").innerHTML = legends.averageDailyExpense
    document.querySelector("#avgMonthlyExp").innerHTML = legends.averageMonthlyExpense
}

async function recalculateLegends() {
    const filteredData = table.getData("active");
    calculateLegends(filteredData)
}