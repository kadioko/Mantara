export const supportedLocales = ["en", "sw"] as const;
export type Locale = (typeof supportedLocales)[number];

/**
 * English is the source of truth: every key exists here. Other locales are partial on purpose, so a
 * new screen can ship the moment its English copy is written rather than waiting on a translator.
 * Anything not yet translated falls back to English, which is readable, rather than blank or a
 * crash. translationGaps() below makes what is outstanding visible instead of silently forgotten.
 */
const english = {
  // Form vocabulary shared across the module forms. Adding these once is what makes a data-entry
  // screen bilingual without translating each form's labels separately.
  fName: "Name", fNotes: "Notes", fCategory: "Category", fDescription: "Description", fReference: "Reference",
  fDate: "Date", fTime: "Time", fStartDate: "Start date", fDueOn: "Due on", fIssuedOn: "Issued on", fExpiresOn: "Expires on",
  fQuantity: "Quantity", fUnit: "Unit", fUnitCost: "Unit cost", fAmount: "Amount", fCurrency: "Currency", fLitres: "Litres",
  fStatus: "Status", fPriority: "Priority", fReason: "Reason", fSummary: "Summary", fSeverity: "Severity",
  fItem: "Item", fStore: "Store", fSupplier: "Supplier", fEquipment: "Equipment", fWorker: "Worker", fShift: "Shift",
  fWorkOrder: "Work order", fLocation: "Location", fMaterial: "Material", fGrade: "Grade", fMeter: "Meter reading",
  fSku: "SKU", fReorderLevel: "Reorder level", fCapacity: "Capacity", fFuelType: "Fuel type", fBudget: "Budget",
  fRecurrence: "Recurrence", fRequirement: "Requirement", fLicence: "Licence", fAssignedTo: "Assigned to",
  fFrom: "From", fTo: "To", fOccurredOn: "Occurred on", fReportedOn: "Reported on", fScheduledFor: "Scheduled for",
  optNotRecorded: "Not recorded", optUnassigned: "Unassigned", optNotLinked: "Not linked",
  optUncategorised: "Uncategorised", optNoShift: "No shift", optNotEquipmentSpecific: "Not equipment specific",
  optNotForWorkOrder: "Not for a work order", optSelectEquipment: "Select equipment", optNone: "None",
  actAdd: "Add", actRecord: "Record", actSubmit: "Submit", actApprove: "Approve", actReject: "Reject",
  actComplete: "Complete", actIssue: "Issue", actReceive: "Receive", actTransfer: "Transfer", actAdjust: "Adjust",
  actSaveChanges: "Save changes", actDispatch: "Dispatch",
  hintRequiredMark: "Fields marked with * are required.",
  showingRange: "Showing {first}–{last} of {total}", previous: "Previous", next: "Next", search: "Search", clear: "Clear", pageOfPages: "Page {page} of {pages}", pagination: "Pagination",
  create: "Create", update: "Update", cancel: "Cancel", edit: "Edit", remove: "Remove", confirm: "Confirm", actions: "Actions", status: "Status", date: "Date", quantity: "Quantity", unit: "Unit", amount: "Amount", reference: "Reference", description: "Description", required: "required", optional: "optional", all: "All", none: "None", yes: "Yes", no: "No", saving: "Saving...", saved: "Saved.", total: "Total", type: "Type",
  offline: "You are offline. Anything you save now will not reach the server — keep this page open and wait for the connection to return.",
  rateLimited: "That has been done too many times recently. Please wait a little and try again.", noPermission: "You do not have permission to do that.", checkTheForm: "Please check the highlighted fields and try again.",
  language: "Language", english: "English", swahili: "Kiswahili", save: "Save", switch: "Switch", signOut: "Sign out", collapseSidebar: "Hide sidebar", expandSidebar: "Show sidebar",
  email: "Email", password: "Password", pleaseWait: "Please wait...", signIn: "Sign in", createAccount: "Create account",
  welcomeBack: "Welcome back", signInDescription: "Sign in to manage your mining operations.", newToMantara: "New to Mantara?", alreadyHaveAccount: "Already have an account?",
  createAccountTitle: "Create your account", createAccountDescription: "Start setting up your organization.", authInvalid: "Enter a valid email and a password of at least 12 characters.", authSignInFailed: "Unable to sign in with those details.", authSignUpFailed: "Unable to create your account. Please try again.", authConfirmEmail: "Check your email to confirm your account, then sign in.", passwordRequirement: "At least 12 characters.",
  setupWorkspace: "Set up your workspace", setupDescription: "Create your company and first mine site. You can add more sites later.", organizationName: "Organization name", firstMineSite: "First mine site", countryCode: "Country code", creating: "Creating...", createOrganization: "Create organization", onboardingInvalid: "Enter an organization name and your first mine site.", onboardingFailed: "We could not create the organization. Please try again.",
  miningOps: "Mining intelligence and operations", organization: "Organization", mineSite: "Mine site", switchWorkspace: "Switch workspace", dashboard: "Dashboard", workers: "Workers", attendance: "Attendance", currentMineSite: "Current mine site",
  equipment: "Equipment", shifts: "Shifts", production: "Production", fuel: "Fuel", maintenance: "Maintenance", inventory: "Inventory", expenses: "Expenses", compliance: "Compliance", safety: "Safety", platformAdmin: "Platform admin",
  assets: "Assets", operations: "Operations", controls: "Controls", riskAndInsight: "Risk and insight", mostRecentFirst: "Most recent first", noneRecorded: "None recorded.",
  overview: "Overview", overviewDescription: "Today's operational position for {site}.", activeWorkers: "Active workers", presentToday: "Present today", operationalEquipment: "Equipment operating", equipmentDown: "Equipment down", nothingToShow: "Nothing to show yet", nothingToShowDescription: "Figures appear here as your team records work against each module.",
  reports: "Reports", notifications: "Notifications", people: "People", mineSites: "Mine sites", roles: "Roles", auditLog: "Audit log", auditLogDescription: "A record of sensitive and significant actions in {organization}.", auditWhen: "When", auditAction: "Action", auditRecord: "Record", auditBy: "By", noAuditEntries: "No audit entries have been recorded yet.", settings: "Settings",
  somethingWentWrong: "Something went wrong", somethingWentWrongDescription: "This screen could not be loaded. The problem has not changed any of your records.", tryAgain: "Try again", pageNotFound: "Page not found", pageNotFoundDescription: "That record does not exist, or it belongs to another mine site.", backToDashboard: "Back to dashboard", loading: "Loading...",
  equipmentDescription: "Machines and vehicles registered to {site}.", equipmentRegister: "Equipment register", noEquipment: "No equipment is registered at this site yet.",
  shiftsDescription: "Shift plan for {site}.", recentShifts: "Recent shifts", noShifts: "No shifts planned yet.",
  productionDescription: "Production capture and approvals for {site}.", productionEntries: "Production entries", downtime: "Downtime", downtimeDescription: "Lost operating time recorded against shifts and equipment.",
  fuelDescription: "Fuel stores and movements for {site}.", fuelOnHand: "Fuel on hand", activeStores: "Active stores", fuelStores: "Fuel stores", noFuelStores: "No fuel stores have been created at this site yet.",
  maintenanceDescription: "Requests, work orders, and service schedules for {site}.", openWorkOrders: "Open work orders", openRequests: "Open requests", servicesOverdue: "Services overdue", workOrders: "Work orders", requests: "Requests",
  inventoryDescription: "Stock, stores, and movements for {site}.", stockOnHand: "Stock on hand", catalogueAndStores: "Catalogue and stores", reorderWatch: "Reorder watch",
  expensesDescription: "Spending and budgets for {site}.", approvedSpend: "Approved spend (last 50)", awaitingApproval: "Awaiting approval", activeBudgets: "Active budgets", budgets: "Budgets",
  complianceDescription: "Licences, obligations, and deadlines for {organization}.", licencesHeld: "Licences held", expiringWithin: "Expiring within {days} days", tasksOverdue: "Tasks overdue", licences: "Licences", obligations: "Obligations", tasksAndDeadlines: "Tasks and deadlines",
  safetyDescription: "Incidents, inspections, and corrective actions at {site}.", openIncidents: "Open incidents", openCorrectiveActions: "Open corrective actions", actionsOverdue: "Actions overdue", incidents: "Incidents", inspections: "Inspections", correctiveActions: "Corrective actions",
  workspaceReady: "Your secure organization, membership, mine-site, and permission foundation is ready. Operational dashboard data will appear as each module is implemented.", workspaceShell: "Workspace shell in progress", workspaceShellDescription: "Organization and mine-site context are selected securely. Next: Workers and attendance.",
  workforce: "Workforce", workersDescription: "Personnel registered to {site}.", registerWorker: "Register worker", registerWorkerDescription: "Fields marked required are needed to create the personnel record.", fullName: "Full name", employeeNumber: "Employee or contractor number", phoneNumber: "Phone number", jobTitle: "Job title", employmentType: "Employment type", employee: "Employee", contractor: "Contractor", casual: "Casual", startDate: "Start date", emergencyContactName: "Emergency contact name", emergencyContactPhone: "Emergency contact phone", notes: "Notes", registering: "Registering...", workerRegister: "Worker register", activeRecords: "active records", noWorkers: "No workers are registered at this site yet.", noJobTitle: "No job title", workerInvalid: "Enter the worker's full name and check the worker details.", workerNoContext: "Select an active organization and mine site first.", workerNoPermission: "You do not have permission to register workers.", workerDuplicate: "That employee number already exists in this organization.", workerFailed: "Unable to save the worker. Please try again.", workerCreated: "Worker registered.", workerProfile: "Worker profile", workerDetails: "Worker details", employment: "Employment", contact: "Contact", notProvided: "Not provided", attendanceDescription: "Record and review daily attendance for {site}.", markAttendance: "Mark attendance", attendanceDate: "Attendance date", worker: "Worker", attendanceStatus: "Status", present: "Present", absent: "Absent", late: "Late", leave: "Leave", recording: "Saving...", recordAttendance: "Save attendance", noAttendance: "No attendance records for this site yet.", attendanceRecorded: "Attendance recorded.", attendanceInvalid: "Select a worker, valid date, and attendance status.", attendanceNoPermission: "You do not have permission to record attendance.", attendanceWorkerInvalid: "That worker is not active at the selected mine site.", attendanceFailed: "Unable to save attendance. Please try again.",
} as const;

const swahili: Partial<Record<MessageKey, string>> = {
  fName: "Jina", fNotes: "Maelezo", fCategory: "Kundi", fDescription: "Ufafanuzi", fReference: "Kumbukumbu",
  fDate: "Tarehe", fTime: "Saa", fStartDate: "Tarehe ya kuanza", fDueOn: "Inatakiwa ifikapo", fIssuedOn: "Ilitolewa tarehe", fExpiresOn: "Inaisha tarehe",
  fQuantity: "Kiasi", fUnit: "Kipimo", fUnitCost: "Bei ya kipimo", fAmount: "Kiasi cha fedha", fCurrency: "Sarafu", fLitres: "Lita",
  fStatus: "Hali", fPriority: "Kipaumbele", fReason: "Sababu", fSummary: "Muhtasari", fSeverity: "Ukubwa wa tukio",
  fItem: "Bidhaa", fStore: "Ghala", fSupplier: "Msambazaji", fEquipment: "Kifaa", fWorker: "Mfanyakazi", fShift: "Zamu",
  fWorkOrder: "Agizo la kazi", fLocation: "Eneo", fMaterial: "Malighafi", fGrade: "Kiwango cha madini", fMeter: "Usomaji wa mita",
  fSku: "SKU", fReorderLevel: "Kiwango cha kuagiza tena", fCapacity: "Ujazo", fFuelType: "Aina ya mafuta", fBudget: "Bajeti",
  fRecurrence: "Marudio", fRequirement: "Wajibu", fLicence: "Leseni", fAssignedTo: "Amepewa",
  fFrom: "Kutoka", fTo: "Kwenda", fOccurredOn: "Lilitokea tarehe", fReportedOn: "Iliripotiwa tarehe", fScheduledFor: "Imepangwa tarehe",
  optNotRecorded: "Haijarekodiwa", optUnassigned: "Hajapewa mtu", optNotLinked: "Haijaunganishwa",
  optUncategorised: "Haina kundi", optNoShift: "Hakuna zamu", optNotEquipmentSpecific: "Si mahususi kwa kifaa",
  optNotForWorkOrder: "Si kwa agizo la kazi", optSelectEquipment: "Chagua kifaa", optNone: "Hakuna",
  actAdd: "Ongeza", actRecord: "Rekodi", actSubmit: "Wasilisha", actApprove: "Idhinisha", actReject: "Kataa",
  actComplete: "Kamilisha", actIssue: "Toa", actReceive: "Pokea", actTransfer: "Hamisha", actAdjust: "Rekebisha",
  actSaveChanges: "Hifadhi mabadiliko", actDispatch: "Safirisha",
  hintRequiredMark: "Sehemu zenye alama ya * ni lazima.",
  showingRange: "Inaonyesha {first}–{last} kati ya {total}", previous: "Iliyotangulia", next: "Inayofuata", search: "Tafuta", clear: "Futa", pageOfPages: "Ukurasa {page} kati ya {pages}", pagination: "Kurasa",
  create: "Unda", update: "Sasisha", cancel: "Ghairi", edit: "Hariri", remove: "Ondoa", confirm: "Thibitisha", actions: "Vitendo", status: "Hali", date: "Tarehe", quantity: "Kiasi", unit: "Kipimo", amount: "Kiasi cha fedha", reference: "Kumbukumbu", description: "Maelezo", required: "lazima", optional: "si lazima", all: "Zote", none: "Hakuna", yes: "Ndiyo", no: "Hapana", saving: "Inahifadhi...", saved: "Imehifadhiwa.", total: "Jumla", type: "Aina",
  offline: "Hauko mtandaoni. Chochote utakachohifadhi sasa hakitafika kwenye seva — acha ukurasa huu wazi na subiri muunganisho urudi.",
  rateLimited: "Jambo hilo limefanyika mara nyingi mno hivi karibuni. Tafadhali subiri kidogo kisha ujaribu tena.", noPermission: "Huna ruhusa ya kufanya hivyo.", checkTheForm: "Tafadhali angalia sehemu zilizoangaziwa kisha ujaribu tena.",
  language: "Lugha", english: "English", swahili: "Kiswahili", save: "Hifadhi", switch: "Badilisha", signOut: "Ondoka", collapseSidebar: "Ficha utepe wa pembeni", expandSidebar: "Onyesha utepe wa pembeni",
  email: "Barua pepe", password: "Nenosiri", pleaseWait: "Tafadhali subiri...", signIn: "Ingia", createAccount: "Fungua akaunti",
  welcomeBack: "Karibu tena", signInDescription: "Ingia ili kusimamia shughuli zako za uchimbaji.", newToMantara: "Mgeni Mantara?", alreadyHaveAccount: "Una akaunti tayari?",
  createAccountTitle: "Fungua akaunti yako", createAccountDescription: "Anza kusanidi shirika lako.", authInvalid: "Weka barua pepe sahihi na nenosiri lenye angalau herufi 12.", authSignInFailed: "Imeshindikana kuingia kwa taarifa hizo.", authSignUpFailed: "Imeshindikana kufungua akaunti. Tafadhali jaribu tena.", authConfirmEmail: "Angalia barua pepe yako kuthibitisha akaunti, kisha ingia.", passwordRequirement: "Angalau herufi 12.",
  setupWorkspace: "Sanidi eneo lako la kazi", setupDescription: "Unda kampuni yako na eneo lako la kwanza la mgodi. Unaweza kuongeza maeneo mengine baadaye.", organizationName: "Jina la shirika", firstMineSite: "Eneo la kwanza la mgodi", countryCode: "Msimbo wa nchi", creating: "Inaundwa...", createOrganization: "Unda shirika", onboardingInvalid: "Weka jina la shirika na eneo lako la kwanza la mgodi.", onboardingFailed: "Hatujaweza kuunda shirika. Tafadhali jaribu tena.",
  miningOps: "Akili na usimamizi wa shughuli za uchimbaji", organization: "Shirika", mineSite: "Eneo la mgodi", switchWorkspace: "Badilisha eneo la kazi", dashboard: "Dashibodi", workers: "Wafanyakazi", attendance: "Mahudhurio", currentMineSite: "Eneo la sasa la mgodi",
  equipment: "Vifaa", shifts: "Zamu", production: "Uzalishaji", fuel: "Mafuta", maintenance: "Matengenezo", inventory: "Ghala", expenses: "Matumizi", compliance: "Uzingatiaji", safety: "Usalama", platformAdmin: "Usimamizi wa mfumo",
  assets: "Rasilimali", operations: "Uendeshaji", controls: "Udhibiti", riskAndInsight: "Hatari na uelewa", mostRecentFirst: "Ya karibuni kwanza", noneRecorded: "Hakuna iliyorekodiwa.",
  overview: "Muhtasari", overviewDescription: "Hali ya shughuli za leo kwa {site}.", activeWorkers: "Wafanyakazi hai", presentToday: "Waliohudhuria leo", operationalEquipment: "Vifaa vinavyofanya kazi", equipmentDown: "Vifaa visivyofanya kazi", nothingToShow: "Hakuna cha kuonyesha bado", nothingToShowDescription: "Takwimu zitaonekana hapa timu yako itakapoanza kurekodi kazi katika kila moduli.",
  reports: "Ripoti", notifications: "Arifa", people: "Watu", mineSites: "Maeneo ya migodi", roles: "Majukumu", auditLog: "Kumbukumbu ya ukaguzi", auditLogDescription: "Rekodi ya vitendo nyeti na muhimu katika {organization}.", auditWhen: "Lini", auditAction: "Kitendo", auditRecord: "Rekodi", auditBy: "Na nani", noAuditEntries: "Hakuna kumbukumbu za ukaguzi bado.", settings: "Mipangilio",
  somethingWentWrong: "Hitilafu imetokea", somethingWentWrongDescription: "Skrini hii haikuweza kupakiwa. Tatizo hili halijabadilisha rekodi zako.", tryAgain: "Jaribu tena", pageNotFound: "Ukurasa haujapatikana", pageNotFoundDescription: "Rekodi hiyo haipo, au ni ya eneo lingine la mgodi.", backToDashboard: "Rudi kwenye dashibodi", loading: "Inapakia...",
  equipmentDescription: "Mashine na magari yaliyosajiliwa katika {site}.", equipmentRegister: "Daftari la vifaa", noEquipment: "Hakuna kifaa kilichosajiliwa katika eneo hili bado.",
  shiftsDescription: "Mpango wa zamu wa {site}.", recentShifts: "Zamu za karibuni", noShifts: "Hakuna zamu zilizopangwa bado.",
  productionDescription: "Uingizaji na uidhinishaji wa uzalishaji kwa {site}.", productionEntries: "Rekodi za uzalishaji", downtime: "Muda wa kusimama", downtimeDescription: "Muda wa kazi uliopotea uliorekodiwa kwa zamu na vifaa.",
  fuelDescription: "Matanki ya mafuta na miamala ya {site}.", fuelOnHand: "Mafuta yaliyopo", activeStores: "Matanki yanayotumika", fuelStores: "Matanki ya mafuta", noFuelStores: "Hakuna tanki la mafuta lililoundwa katika eneo hili bado.",
  maintenanceDescription: "Maombi, maagizo ya kazi na ratiba za huduma za {site}.", openWorkOrders: "Maagizo ya kazi wazi", openRequests: "Maombi wazi", servicesOverdue: "Huduma zilizochelewa", workOrders: "Maagizo ya kazi", requests: "Maombi",
  inventoryDescription: "Hisa, maghala na miamala ya {site}.", stockOnHand: "Hisa zilizopo", catalogueAndStores: "Katalogi na maghala", reorderWatch: "Ufuatiliaji wa kuagiza tena",
  expensesDescription: "Matumizi na bajeti za {site}.", approvedSpend: "Matumizi yaliyoidhinishwa (50 ya mwisho)", awaitingApproval: "Zinasubiri idhini", activeBudgets: "Bajeti zinazotumika", budgets: "Bajeti",
  complianceDescription: "Leseni, wajibu na tarehe za mwisho za {organization}.", licencesHeld: "Leseni zilizopo", expiringWithin: "Zinaisha ndani ya siku {days}", tasksOverdue: "Kazi zilizochelewa", licences: "Leseni", obligations: "Wajibu", tasksAndDeadlines: "Kazi na tarehe za mwisho",
  safetyDescription: "Matukio, ukaguzi na hatua za marekebisho katika {site}.", openIncidents: "Matukio yaliyo wazi", openCorrectiveActions: "Hatua za marekebisho wazi", actionsOverdue: "Hatua zilizochelewa", incidents: "Matukio", inspections: "Ukaguzi", correctiveActions: "Hatua za marekebisho",
  workspaceReady: "Msingi salama wa shirika, wanachama, maeneo ya mgodi na ruhusa uko tayari. Taarifa za dashibodi zitaonekana kila moduli itakapokamilika.", workspaceShell: "Muundo wa eneo la kazi unaendelea", workspaceShellDescription: "Shirika na eneo la mgodi huchaguliwa kwa usalama. Kinachofuata: wafanyakazi na mahudhurio.",
  workforce: "Wafanyakazi", workersDescription: "Wafanyakazi waliosajiliwa katika {site}.", registerWorker: "Sajili mfanyakazi", registerWorkerDescription: "Sehemu zenye alama ya lazima zinahitajika kuunda kumbukumbu ya mfanyakazi.", fullName: "Jina kamili", employeeNumber: "Namba ya mfanyakazi au mkandarasi", phoneNumber: "Namba ya simu", jobTitle: "Cheo cha kazi", employmentType: "Aina ya ajira", employee: "Mwajiriwa", contractor: "Mkandarasi", casual: "Kibarua", startDate: "Tarehe ya kuanza", emergencyContactName: "Jina la mawasiliano ya dharura", emergencyContactPhone: "Simu ya mawasiliano ya dharura", notes: "Maelezo", registering: "Inasajiliwa...", workerRegister: "Orodha ya wafanyakazi", activeRecords: "kumbukumbu zinazotumika", noWorkers: "Hakuna wafanyakazi waliosajiliwa katika eneo hili bado.", noJobTitle: "Hakuna cheo cha kazi", workerInvalid: "Weka jina kamili la mfanyakazi na uhakikishe taarifa zake.", workerNoContext: "Chagua shirika na eneo la mgodi linalotumika kwanza.", workerNoPermission: "Huna ruhusa ya kusajili wafanyakazi.", workerDuplicate: "Namba hiyo ya mfanyakazi tayari ipo katika shirika hili.", workerFailed: "Imeshindikana kuhifadhi mfanyakazi. Tafadhali jaribu tena.", workerCreated: "Mfanyakazi amesajiliwa.", workerProfile: "Wasifu wa mfanyakazi", workerDetails: "Taarifa za mfanyakazi", employment: "Ajira", contact: "Mawasiliano", notProvided: "Haijatolewa", attendanceDescription: "Andika na kagua mahudhurio ya kila siku kwa {site}.", markAttendance: "Weka mahudhurio", attendanceDate: "Tarehe ya mahudhurio", worker: "Mfanyakazi", attendanceStatus: "Hali", present: "Amehudhuria", absent: "Hayupo", late: "Amechelewa", leave: "Likizo", recording: "Inahifadhiwa...", recordAttendance: "Hifadhi mahudhurio", noAttendance: "Hakuna kumbukumbu za mahudhurio katika eneo hili bado.", attendanceRecorded: "Mahudhurio yamehifadhiwa.", attendanceInvalid: "Chagua mfanyakazi, tarehe sahihi na hali ya mahudhurio.", attendanceNoPermission: "Huna ruhusa ya kurekodi mahudhurio.", attendanceWorkerInvalid: "Mfanyakazi huyo hayuko katika eneo la mgodi lililochaguliwa.", attendanceFailed: "Imeshindikana kuhifadhi mahudhurio. Tafadhali jaribu tena.",
};

export type MessageKey = keyof typeof english;

const messages: Record<Locale, Partial<Record<MessageKey, string>>> = { en: english, sw: swahili };

export function t(locale: Locale, key: MessageKey, values?: Record<string, string>) {
  let message = messages[locale][key] ?? english[key];
  for (const [name, value] of Object.entries(values ?? {})) message = message.replaceAll(`{${name}}`, value);
  return message;
}

/** Every key in the catalogue, for exhaustive checks. */
export function allMessageKeys(): MessageKey[] {
  return Object.keys(english) as MessageKey[];
}

/** Keys a locale has not translated yet, in catalogue order, for the report below. */
export function translationGaps(locale: Locale): MessageKey[] {
  const catalogue = messages[locale];
  return (Object.keys(english) as MessageKey[]).filter((key) => catalogue[key] === undefined);
}

/** How complete a locale is, as a percentage rounded down. Used by the report and its test. */
export function translationCoverage(locale: Locale) {
  const total = Object.keys(english).length;
  return { total, translated: total - translationGaps(locale).length, percent: Math.floor(((total - translationGaps(locale).length) / total) * 100) };
}
