let dayWiseLineChart = null
let monthWiseLineChart = null
let categoryChart = null
let weeklyChart = null

async function displayAllCharts(table) {

	if (document.querySelector("#data-charts").style.display == 'block'){

		// load all the charts here
		loadDayWiseExpenseChart(table)
		loadMonthWiseExpenseChart(table)
		loadCategoryExpenseChart(table)
		loadWeeklyExpenseChart(table)

	}
}

async function filterAllCharts(table) {

	// filter all the charts here
	loadDayWiseExpenseChart(table)
	loadMonthWiseExpenseChart(table)
	loadCategoryExpenseChart(table)
	loadWeeklyExpenseChart(table)

}

async function loadDayWiseExpenseChart(table) {  //This will create the chart for last month

	if (table == null) {
		return
	}
	
	let months = {"01":"January","02":"February","03":"March","04":"April","05":"May","06":"June",
		"07":"July","08":"August","09":"September","10":"October","11":"November","12":"December"}

	const filteredData = table.getData("active");

	if (filteredData.length < 1){ // check if no value in table
		return
	}

	const dateDelimiter = filteredData[0].TranDate[4]
	const lastMonth = filteredData[filteredData.length-1].TranDate.split(dateDelimiter)[1]
	const lastyear = filteredData[filteredData.length-1].TranDate.split(dateDelimiter)[0]

	let fullmonth = months[lastMonth] +" "+ lastyear

	const rawData = await getMonthDailyExpense(table, filteredData, lastMonth, lastyear)

	var options = {
		title: {
          text: 'Cash Flow Trend for Month',
          align: 'left'
        },
		chart: {
			type: 'line',
			height: 270,
			width: 900
		},
		series: [{
			name: "Debit",
			data: rawData,
			parsing: {
				x: 'date',
				y: 'debitDayTotal'
			}
		},{
			name: "Credit",
			data: rawData,
			parsing: {
				x: 'date',
				y: 'creditDayTotal'
			}
		}],
		yaxis: {
			title: {
				text: 'Total Amount'
			}
        },
		xaxis: {
			title: {
				text: 'Days'
			}
        },
		stroke :{
			width : 2
		},
		markers: {
			size: 5,
		},
		colors: ['#b81010', '#109704'],
		legend: {
			position: 'top',
			horizontalAlign: 'right',
			floating: true,
			offsetY: -40,
			offsetX: 0
		},
		subtitle: {
			text: fullmonth,
			align: 'left',
			style: {
				fontSize:  '14px',
				color:  '#6c6c6d'
			}
		}
	}

	if (dayWiseLineChart){
		dayWiseLineChart.destroy();
	}

	dayWiseLineChart = new ApexCharts(document.querySelector("#dailyExpenseLineChart"), options);

	dayWiseLineChart.render();

}

async function loadMonthWiseExpenseChart(table) {  //This will create the chart for last year

	if (table == null) {
		return
	}

	const filteredData = table.getData("active");

	if (filteredData.length < 1){ // check if no value in table
		return
	}
	const dateDelimiter = filteredData[0].TranDate[4]
	const lastyear = filteredData[filteredData.length-1].TranDate.split(dateDelimiter)[0]

	let fullYear = lastyear

	const rawData = await getmonthlyExpense(table, filteredData, lastyear)
	var options = {
		title: {
          text: 'Cash Flow Trend for Year',
          align: 'left'
        },
		chart: {
			type: 'area',
			height: 270,
			width: 450
		},
		series: [{
			name: "Debit",
			data: rawData,
			parsing: {
				x: 'date',
				y: 'debitMonthTotal'
			}
		},
		{
			name: "Credit",
			data: rawData,
			parsing: {
				x: 'date',
				y: 'creditMonthTotal'
			}
		}],
		yaxis: {
			title: {
				text: 'Total Amount'
			}
        },
		xaxis: {
			title: {
				text: 'Months'
			}
        },
		stroke :{
			// width : 2,
			curve: 'straight'
		},
		markers: {
			size: 5,
		},
		colors: ['#b81010', '#109704'],
		legend: {
			position: 'top',
			horizontalAlign: 'right',
			floating: true,
			offsetY: -40,
			offsetX: 0
		},
		subtitle: {
			text: fullYear,
			align: 'left',
			style: {
				fontSize:  '14px',
				color:  '#6c6c6d'
			}
		}
	}

	if (monthWiseLineChart){
		monthWiseLineChart.destroy();
	}

	monthWiseLineChart = new ApexCharts(document.querySelector("#monthlyExpenseLineChart"), options);

	monthWiseLineChart.render();

}

async function loadCategoryExpenseChart(table) {
		
	if (table == null) {
		return
	}

	const filteredData = table.getData("active");

	if (filteredData.length < 1){ // check if no value in table
		return
	}

	const rawData = await getCategoryExpense(table, filteredData)

	var options = {
		title: {
          text: 'Category Expense Chart',
          align: 'left'
        },
		chart: {
			type: 'bar',
			height: 575,
			width: 390
		},
		plotOptions: {
			bar: {
				borderRadius: 4,
            	borderRadiusApplication: 'end',
				horizontal: true
			}
		},
		dataLabels: {
          enabled: false
        },
		series: [{
			name: "Debit",
			data: rawData,
			parsing: {
				x: 'category',
				y: 'debitCatTotal'
			}
		}],
		yaxis: {
			title: {
				text: 'Categories'
			}
        },
		xaxis: {
			title: {
				text: 'Total Amount'
			}
        },
		colors: ['#6c10b8'],
		legend: {
			position: 'top',
			horizontalAlign: 'right',
			floating: true,
			offsetY: -40,
			offsetX: 0
		},
	}

	if (categoryChart){
		categoryChart.destroy();
	}

	categoryChart = new ApexCharts(document.querySelector("#categoryChart"), options);

	categoryChart.render();
}

async function loadWeeklyExpenseChart(table) {

	if (table == null) {
		return
	}

	const filteredData = table.getData("active");

	if (filteredData.length < 1){ // check if no value in table
		return
	}

	const rawData = await getWeeklyExpense(table, filteredData)
	debugger
	var options = {
		title: {
          text: 'Weekly Expense Chart',
          align: 'left'
        },
		chart: {
			type: 'bar',
			height: 270,
			width: 450
		},
		plotOptions: {
			bar: {
				borderRadius: 4,
            	borderRadiusApplication: 'end',
				horizontal: true
			}
		},
		dataLabels: {
          enabled: false
        },
		series: [{
			name: "Debit",
			data: rawData,
			parsing: {
				x: 'dayName',
				y: 'debitTotal'
			}
		}],
		yaxis: {
			title: {
				text: 'Week Day'
			}
        },
		xaxis: {
			title: {
				text: 'Total Amount'
			}
        },
		colors: ['#10a4b8']
	}

	if (weeklyChart){
		weeklyChart.destroy();
	}

	weeklyChart = new ApexCharts(document.querySelector("#weeklyChart"), options);

	weeklyChart.render();
}

async function getMonthDailyExpense(table, filteredData, month, year) {

	if (table == null) {
		return
	}

	let dateDelimiter = filteredData[0].TranDate[4]
	let selectedMonthData = []

	filteredData.forEach(element => {
		if (element.TranDate.split(dateDelimiter)[1] == month && element.TranDate.split(dateDelimiter)[0] == year){
			selectedMonthData.push(element)
		}
	});

	let chartDataList = []

	let prevDay = ""
	let debitDayTotal = 0
	let creditDayTotal = 0

	for (let i=0 ; i<selectedMonthData.length; i++){
		let chartData

		if (selectedMonthData[i].TranDate.split(dateDelimiter)[2] == prevDay){
			
			debitDayTotal += Number(selectedMonthData[i].Debit)
			creditDayTotal += Number(selectedMonthData[i].Credit)
			
		}else{
			if(prevDay != "" && i != selectedMonthData.length-1){
				chartData = {
					date : prevDay,
					debitDayTotal : debitDayTotal.toFixed(2),
					creditDayTotal : creditDayTotal.toFixed(2)
				}
				chartDataList.push(chartData)
			}
			
			debitDayTotal = Number(selectedMonthData[i].Debit)
			creditDayTotal = Number(selectedMonthData[i].Credit)
			prevDay = selectedMonthData[i].TranDate.split(dateDelimiter)[2]
		}


		if (i == selectedMonthData.length-1){
			chartData = {
				date : prevDay,
				debitDayTotal : debitDayTotal.toFixed(2),
				creditDayTotal : creditDayTotal.toFixed(2)
			}
			chartDataList.push(chartData)
		}
	}

	return chartDataList
}

async function getmonthlyExpense(table, filteredData, year) {
	
	if (table == null) {
		return
	}

	let dateDelimiter = filteredData[0].TranDate[4]
	let selectedYearData = []

	filteredData.forEach(element => {
		if (element.TranDate.split(dateDelimiter)[0] == year){
			selectedYearData.push(element)
		}
	});

	let chartDataList = []

	let months = {"01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
		"07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec"}

	let prevMonth = ""
	let debitMonthTotal = 0
	let creditMonthTotal = 0

	for (let i=0 ; i<selectedYearData.length; i++){
		let chartData

		if (selectedYearData[i].TranDate.split(dateDelimiter)[1] == prevMonth){
			
			debitMonthTotal += Number(selectedYearData[i].Debit)
			creditMonthTotal += Number(selectedYearData[i].Credit)
			
		}else{
			if(prevMonth != "" && i != selectedYearData.length-1){
				chartData = {
					date : months[prevMonth],
					debitMonthTotal : debitMonthTotal.toFixed(2),
					creditMonthTotal : creditMonthTotal.toFixed(2)
				}
				chartDataList.push(chartData)
			}
			
			debitMonthTotal = Number(selectedYearData[i].Debit)
			creditMonthTotal = Number(selectedYearData[i].Credit)
			prevMonth = selectedYearData[i].TranDate.split(dateDelimiter)[1]
		}

		if (i == selectedYearData.length-1){
			chartData = {
				date : months[prevMonth],
				debitMonthTotal : debitMonthTotal.toFixed(2),
				creditMonthTotal : creditMonthTotal.toFixed(2)
			}
			chartDataList.push(chartData)
		}
	}

	return chartDataList
}

async function getCategoryExpense(table, filteredData) {
	if (table == null) {
		return
	}

	let chartDataList  = []

	let categoryList = Object.keys(categoryMap);

	for (let i=0 ; i<categoryList.length ; i++){

		let tempDebitTotal = 0
		let tempCreditTotal = 0
		for (let j=0 ; j<filteredData.length ; j++){
			if (categoryList[i] == filteredData[j].Category){
				tempDebitTotal += filteredData[j].Debit
				tempCreditTotal += filteredData[j].Credit
			}
		}

		let chartData = {
			category : categoryList[i],
			debitCatTotal : tempDebitTotal.toFixed(1),
			creditCatTotal : tempCreditTotal.toFixed(1)
		}
		chartDataList.push(chartData)
	}

	return chartDataList
}

async function getWeeklyExpense(table, filteredData) {
	if (table == null) {
		return
	}

	let chartDataList  = []
	 debugger
	const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	for (let i=0 ; i<7 ; i++){ // iterating through weeks
		let tempTotalDebit = 0
		for (let j=0 ; j<filteredData.length ; j++){
			const dayName = days[new Date(filteredData[j].TranDate).getDay()];

			if(days[i] == dayName){
				tempTotalDebit += filteredData[j].Debit
			}
		}
		let chartData = {
			dayName : days[i],
			debitTotal : tempTotalDebit.toFixed(1)
		}
		chartDataList.push(chartData)
	}

	return chartDataList
}