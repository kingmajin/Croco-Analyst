let dayWiseLineChart = null
let monthWiseLineChart = null
let categoryChart = null
let weeklyChart = null

const FULL_MONTHS = {"01":"January","02":"February","03":"March","04":"April","05":"May","06":"June",
	"07":"July","08":"August","09":"September","10":"October","11":"November","12":"December"}

const SHORT_MONTHS = {"01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
	"07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec"}

const CHART_GAP = 10

// Height of the "Exclude Uncategorized" checkbox under the category chart
const CATEGORY_OPTION_HEIGHT = 24

const toPoints = (totals, label, amount) => totals.map(total => ({ x: label(total.key), y: Number(total[amount].toFixed(2)) }))

// rows must be sorted by date. Charts are only drawn while the chart view is visible
// because they size themselves to their container.
async function displayAllCharts(rows) {

	const chartDiv = document.querySelector("#data-charts")

	if (chartDiv.style.display != 'block' || rows == null || rows.length < 1){
		return
	}

	// Two rows of charts share the visible height, the category chart takes both
	const rowHeight = Math.max(240, Math.floor((chartDiv.clientHeight - CHART_GAP * 3) / 2))

	loadDayWiseExpenseChart(rows, rowHeight)
	loadMonthWiseExpenseChart(rows, rowHeight)
	loadCategoryExpenseChart(rows, rowHeight * 2 + CHART_GAP - CATEGORY_OPTION_HEIGHT - 20)
	loadWeeklyExpenseChart(rows, rowHeight)
}

async function loadDayWiseExpenseChart(rows, height) {  //This will create the chart for last month

	const lastDate = rows[rows.length-1].TranDate
	const lastMonth = lastDate.slice(5, 7)
	const lastyear = lastDate.slice(0, 4)

	let fullmonth = FULL_MONTHS[lastMonth] +" "+ lastyear

	const totals = dailyTotals(rows, lastDate.slice(0, 7))

	var options = {
		title: {
          text: 'Cash Flow Trend for Month',
          align: 'left'
        },
		chart: {
			type: 'line',
			height: height,
			width: '100%'
		},
		series: [{
			name: "Debit",
			data: toPoints(totals, day => day, "debit")
		},{
			name: "Credit",
			data: toPoints(totals, day => day, "credit")
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

async function loadMonthWiseExpenseChart(rows, height) {  //This will create the chart for last year

	const lastyear = rows[rows.length-1].TranDate.slice(0, 4)

	const totals = monthlyTotals(rows, lastyear)

	var options = {
		title: {
          text: 'Cash Flow Trend for Year',
          align: 'left'
        },
		chart: {
			type: 'area',
			height: height,
			width: '100%'
		},
		series: [{
			name: "Debit",
			data: toPoints(totals, month => SHORT_MONTHS[month], "debit")
		},
		{
			name: "Credit",
			data: toPoints(totals, month => SHORT_MONTHS[month], "credit")
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
			text: lastyear,
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

async function loadCategoryExpenseChart(rows, height) {

	// Uncategorized can be big enough to flatten every other bar, the checkbox under the chart drops it
	const excludeUncategorized = document.querySelector("#excludeUncategorized").checked
	const categories = [...Object.keys(categoryMap), ...(excludeUncategorized ? [] : [UNCATEGORIZED])]

	const totals = categoryTotals(rows, categories)

	var options = {
		title: {
          text: 'Category Expense Chart',
          align: 'left'
        },
		chart: {
			type: 'bar',
			height: height,
			width: '100%'
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
			data: toPoints(totals, category => category, "debit")
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

async function loadWeeklyExpenseChart(rows, height) {

	const totals = weekdayTotals(rows)

	var options = {
		title: {
          text: 'Weekly Expense Chart',
          align: 'left'
        },
		chart: {
			type: 'bar',
			height: height,
			width: '100%'
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
			data: toPoints(totals, day => day, "debit")
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
