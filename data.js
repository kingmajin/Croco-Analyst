const categoryMap = {
    Grocery: [
        "instamart", "blinkit", "zepto", "bigBasket", "jioMart",
        "dmart", "reliance smart", "spencer's", "more retail",
        "easyday", "family bazaar", "star bazaar", "nature's basket",
        "spar", "reliance fresh", "big bazaar", "bajaar",
        "grocery", "mart", "supermarket", "kirana", "provision",
        "daily needs", "general store", "bazaar", "store", "fresh",
        "vegetable", "fruits", "dairy", "milk", "ration",
        "atta", "rice", "dal", "pulses", "flour", "oil", "ghee",
        "masala", "spices", "salt", "sugar", "coffee powder",
        "bread", "eggs", "paneer", "curd", "yogurt",
        "frozen food", "ready to cook", "ready to eat",
        "household items", "cleaning supplies", "detergent",
        "toiletries", "soap", "shampoo", "toothpaste", "general"
    ],

    Food: [
        "swiggy", "zomato", "dominos", "pizza hut", "kfc",
        "mcdonald's", "burger king", "barbeque nation",
        "haldiram's", "subway", "cafe coffee day", "starbucks",
        "wow momo", "bikanervala", "faasos", "behrouz biryani",
        "food", "restaurant", "cafe", "coffee", "dining",
        "pasta", "pizza", "burger", "meal", "tiffin",
        "eatery", "bakery", "snacks", "juice", "biryani",
        "roll", "thali", "breakfast", "lunch", "dinner", "roll",
        "momo", "chaat", "chai", "tea", "tapri",
        "takeaway", "parcel", "dinein", "quick bite", "fastfood",
        "combo", "platter", "buffet", "dessert", "icecream",
        "cafe latte", "espresso", "cold coffee", "mocktail",
        "street food", "dhaba", "canteen", "mess", "recipe",
        "rolls", "shawarma", "noodles", "fries", "sandwich", "receipee"
    ],

    Transportation: [
        "uber", "ola", "rapido", "redbus", "trctc",
        "delhi metro", "bmtc", "best", "ksrtc", "lmrc", "upmrc",
        "upsrtc", "rssrtc",
        "cab", "taxi", "auto", "ride", "trip",
        "bus", "train", "metro", "transport",
        "ticket", "travel pass", "travel",
        "pickup", "drop", "commute", "fare", "ride charge",
        "journey", "ticket booking", "platform ticket",
        "bus pass", "railway", "local train", "suburban",
        "bike taxi", "scooter", "carpool"
    ],

    Fuel: [
        "indian oil", "hp petrol", "bharat petroleum", "shell",
        "reliance petrol", "fuel", "petrol", "diesel", "gas station", "pump",
        "cng", "oil", "filling", "petrol station", "cng station",
        "refuel", "fuel charge", "diesel fill", "petrol fill",
        "fuel surcharge", "tank full", "gas refill"
    ],

    Shopping: [
        "amazon", "flipkart", "myntra", "ajio", "nykaa",
        "meesho", "tata cliq", "reliance trends",
        "pantaloons", "zudio", "firstcry", "vmart", "vishal", "mega mart", "mega",
        "shopping", "clothing", "fashion", "electronic",
        "accessor", "cart", "buy", "sale", "mart", "Kapda", "Cloth",
        "mobile", "laptop", "shoes", "sandals", "Yusta", "Max", "brand", "phone",
        "checkout", "order id", "invoice", "retail", "mall",
        "showroom", "outlet", "brand store", "online order",
        "cart payment", "wishlist", "fashion store",
        "gadgets", "mobile", "laptop", "accessory",

    ],

    Bills: [
        "airtel", "jio", "vodafone", "idea", "bsnl", "vi",
        "bses", "mseb", "tneb", "act",
        "bill", "recharge", "electricity", "water",
        "gas", "broadband", "dth", "utility",
        "postpaid", "prepaid", "wifi", "fiber", "brodband", "cell",
        "billdesk", "autopay", "standing instruction",
        "monthly bill", "usage charge", "service charge",
        "late fee", "due amount", "postpaid bill",
        "recharge successful", "topup", "validity"
    ],

    Entertainment: [
        "netflix", "amazon prime", "hotstar",
        "sony liv", "zee5", "bookmyshow", "spotify", "gaana", "pvr", "cinepolis",
        "inox", "movie", "cinema", "subscription",
        "streaming", "ticket", "show", "music",
        "concert", "event", "theatre", "festival",
        "ott", "subscription", "episode",
        "cinema hall", "multiplex", "screening",
        "gaming", "in-game", "arcade", "ticket booking",
        "live show", "festival pass"
    ],
    Fitness: [
        "cultfit","curefit","gold's gym","anytime fitness",
        "talwalkars","fitness first","snap fitness", "fitness",
        "decathlon","healthkart","myprotein",
        "nike","adidas","puma","reebok", "hyugalife"
    ],

    Medical: [
        "apollo pharmacy", "tata 1mg", "pharmeasy",
        "netmeds", "medplus", "fortis", "max hospital",
        "pharmacy", "medical", "medicine", "doctor",
        "clinic", "hospital", "lab", "health", "diagnostic",
        "test", "scan", "xray", "blood test", "blood",
        "prescription", "consultation", "opd", "ipd",
        "emergency", "surgery", "treatment",
        "pharma", "chemist", "drugstore",
        "vaccination", "health checkup", "therapy"
    ],

    Travel: [
        "makemytrip", "goibibo", "yatra", "airport",
        "air India", "indiGo", "spiceJet",
        "oyo", "treebo", "fabhotels", "redbus", "red", "flix", 
        "flight", "hotel", "booking", "travel","red bus",
        "stay", "resort", "trip", "vacation",
        "checkin", "checkout",
        "itinerary", "boarding", "departure", "arrival",
        "check-in", "check-out", "reservation",
        "travel insurance", "visa", "luggage",
        "holiday package", "tour", "sightseeing"
    ],

    Education: [
        "byju's", "unacademy", "vedantu",
        "coursera", "udemy", "upgrad",
        "course", "education", "class", "training",
        "learning", "tuition", "exam", "coaching",
        "enrollment", "registration fee", "exam fee",
        "certification", "workshop", "seminar",
        "online class", "bootcamp", "study material",
        "ebook", "lecture", "assignment"
    ],

    Finance: [
        "paytm", "phonepe", "google pay", "razorpay",
        "cred", "mobikwik", "bharatpe", "freecharge",
        "upi", "payment", "wallet", "transfer",
        "bank", "credit", "debit", "emi",
        "loan", "interest", "repayment",
        "txn", "transaction", "ref no", "utr",
        "neft", "rtgs", "imps", "upi id",
        "wallet load", "cashback", "reward",
        "settlement", "merchant payment", "gateway",
        "processing fee", "interest charge"
    ],

    PersonalCare: [
        "urban company", "naturals salon", "lakme salon",
        "salon", "spa", "grooming", "beauty",
        "haircut", "facial", "massage",
        "spa service", "salon service", "hair spa",
        "beard trim", "makeup", "skincare",
        "wellness", "self care", "beauty service"
    ],

    Home: [
        "nobroker", "urban ladder", "pepperfry",
        "rent", "maintenance", "repair", "furniture",
        "cleaning", "home service",
        "plumbing", "electrician", "carpenter",
        "home cleaning", "deep cleaning",
        "appliance repair", "ac service",
        "pest control", "maintenance service"
    ],

    Pets: [
        "pet", "dog", "cat", "pet food", "vet",
        "pet grooming", "dog food", "cat food",
        "pet clinic", "vet", "pet care",
        "pet supplies", "litter", "pet toys"
    ],

    Utility: [
        "services", "traders", "enterprise", "enterprises",
        "agency", "solutions"
    ]
}