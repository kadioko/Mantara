# Mantara Blueprint

> This is the long-term product vision. For the active MVP position, delivery sequence, and business milestones, see the [Mantara roadmap and journey](../docs/roadmap.md).

> **Current build scope:** multi-tenant foundation, organizations/sites, Workforce register, attendance, English/Kiswahili UI, and branding. The [project-status audit](../docs/project-status.md) identifies every remaining MVP module.

MANTARA

Mining Intelligence and Operations Platform

Product Vision

Mantara is a mining technology platform designed to help African mining companies operate more efficiently, safely, transparently, and profitably.

The platform will combine mining operations management, geological data, artificial intelligence, computer vision, financial controls, equipment monitoring, compliance management, and an industry marketplace.

Mantara will initially serve artisanal, small-scale, and medium-sized mining operations in Tanzania before expanding across Africa.

Its long-term ambition is to become:

The digital operating system for African mining.

⸻

1. The Problem Mantara Solves

Many small and medium-sized mining operations still manage their businesses through:

* Paper notebooks
* Excel files
* WhatsApp messages
* Verbal instructions
* Manual fuel records
* Unstructured production reports
* Poor inventory controls
* Delayed financial reporting
* Reactive equipment maintenance
* Disconnected geological information

This creates major business risks:

* Fuel theft
* Ore theft
* Incorrect production figures
* Equipment breakdowns
* Poor worker accountability
* Missed licence and compliance deadlines
* Inability to calculate the true cost per tonne
* Weak decision-making
* Difficulty attracting investors and lenders
* Limited visibility for mine owners who are not physically at the site

Mantara will provide one centralized system for managing these activities.

⸻

2. Target Customers

Mantara will initially focus on:

Primary Customers

* Primary Mining Licence holders
* Artisanal and small-scale mining operators
* Small gold-processing plants
* Quarry operators
* Medium-sized mining companies
* Mine owners managing remote sites

Secondary Customers

* Mining contractors
* Equipment-rental businesses
* Mineral laboratories
* Geological consultants
* Mineral transporters
* Mineral buyers and dealers
* Mining cooperatives
* Banks and insurers serving mining companies
* Government and regulatory institutions

⸻

3. Mantara Product Ecosystem

Mantara will consist of five connected systems.

3.1 Mantara OS

Mantara OS is the core mining operations platform.

It manages the daily activities of a mining business.

Main Functions

* Company management
* Mine-site management
* User and role management
* Production recording
* Shift management
* Worker attendance
* Equipment management
* Fuel management
* Inventory management
* Procurement
* Maintenance
* Safety
* Environmental records
* Licence and compliance management
* Finance and cost tracking
* Reports and dashboards

Mantara OS must be built first because the other Mantara systems will depend on the data collected through it.

⸻

3.2 Mantara GeoAI

Mantara GeoAI will help mining companies organize, visualize, and analyse geological and exploration data.

Future Functions

* Geological map uploads
* Satellite imagery
* Drone survey uploads
* GPS coordinate management
* Licence boundary mapping
* Sample-location mapping
* Drill-hole records
* Assay-result management
* Soil and rock sample records
* Exploration target ranking
* Geological report analysis
* Mineralization pattern identification
* AI-assisted prospect scoring

GeoAI must not claim that it can guarantee mineral discoveries.

It should provide decision support based on available geological evidence.

⸻

3.3 Mantara Vision

Mantara Vision will use cameras, drones, and computer vision to monitor mining activities.

Future Functions

* PPE detection
* Helmet and reflective-vest detection
* Restricted-area monitoring
* Vehicle-entry monitoring
* Truck counting
* Ore-bag counting
* Stockpile-volume estimation
* Pit-progress monitoring
* Unauthorized-entry alerts
* Unsafe-behaviour detection
* Equipment-utilization monitoring
* Before-and-after site comparisons

Mantara Vision should begin as an optional module for customers who already have CCTV cameras or drone footage.

⸻

3.4 Mantara Brain

Mantara Brain will be the intelligence layer across the entire platform.

Users will interact with it using natural language.

Example Questions

* How much gold-bearing ore was processed yesterday?
* Which machine consumed the most fuel this month?
* Why did production decrease this week?
* What is our cost per tonne?
* Which equipment is due for maintenance?
* Which licence expires next?
* Which shift has the highest productivity?
* What stock items are running low?
* How much working capital will we need next month?
* What are the biggest operational risks at this site?

Future Functions

* Daily management summaries
* Production anomaly detection
* Fuel-variance detection
* Maintenance predictions
* Financial forecasting
* Compliance reminders
* Risk alerts
* Natural-language reporting
* Automated management reports
* Recommended actions

Mantara Brain must only answer from verified customer data and clearly distinguish facts, estimates, and recommendations.

⸻

3.5 Mantara Market

Mantara Market will connect mining operators with verified mining-industry service providers.

Future Marketplace Categories

* Equipment rental
* Equipment sales
* Spare parts
* Geological consultants
* Drilling contractors
* Laboratories
* Transporters
* Security services
* PPE suppliers
* Fuel suppliers
* Surveyors
* Environmental consultants
* Insurance providers
* Finance providers
* Licensed mineral buyers

Future Functions

* Supplier profiles
* Customer requests
* Quotations
* Service bookings
* Equipment availability
* Ratings and reviews
* Verified-business badges
* Transaction records
* Supplier subscriptions
* Marketplace commissions

Mantara Market should only be introduced after Mantara has established trusted users and verified suppliers.

⸻

4. Recommended Development Strategy

Mantara should be developed in stages.

Phase 1: Core Operations MVP

The first version should contain only the modules required to manage one small or medium-sized mining operation.

MVP Modules

1. Authentication
2. Company management
3. Mine-site management
4. User roles and permissions
5. Daily production
6. Shift records
7. Worker attendance
8. Equipment register
9. Fuel records
10. Maintenance records
11. Inventory
12. Expenses
13. Licence and compliance records
14. Basic dashboards
15. Reports
16. Audit logs
17. Notifications

This version should be usable even without advanced AI.

⸻

Phase 2: Financial and Operational Intelligence

Add:

* Cost per tonne
* Cost per gram or ounce
* Budget versus actual
* Fuel-consumption analysis
* Equipment-utilization reports
* Worker-productivity analysis
* Production forecasts
* Cash-flow forecasts
* Automated daily summaries
* Mantara Brain assistant

⸻

Phase 3: Geological Data

Add:

* Maps
* Sample locations
* Assay results
* Drill-hole records
* Licence boundaries
* Geological file storage
* Exploration dashboards
* GeoAI recommendations

⸻

Phase 4: Computer Vision and Drones

Add:

* CCTV integrations
* Drone uploads
* PPE detection
* Vehicle counting
* Stockpile estimation
* Pit-progress comparison
* Security alerts

⸻

Phase 5: Marketplace

Add:

* Supplier onboarding
* Equipment rental listings
* Service requests
* Quotations
* Verified suppliers
* Reviews
* Payments or commissions

⸻

5. MVP User Roles

Platform Super Admin

Can:

* Manage all Mantara customers
* Suspend or activate organizations
* Manage subscription plans
* Review system usage
* Manage platform settings
* View support issues

Company Owner

Can:

* Access all company information
* View all sites
* Invite users
* Approve major expenses
* View financial reports
* Review production performance

Mine Manager

Can:

* Manage mine-site operations
* Approve production records
* Assign shifts
* Review equipment and fuel records
* View site reports

Site Supervisor

Can:

* Record production
* Record attendance
* Record fuel usage
* Report incidents
* Submit shift reports

Accountant

Can:

* Record and review expenses
* Manage suppliers
* Review budgets
* Export financial reports

Storekeeper

Can:

* Receive inventory
* Issue inventory
* Monitor stock levels
* report damaged or missing stock

Maintenance Officer

Can:

* Manage equipment
* Schedule maintenance
* Record repairs
* track service costs

Safety Officer

Can:

* Record incidents
* Complete inspections
* Manage PPE records
* Track corrective actions

Viewer or Investor

Can:

* View selected dashboards
* View reports
* Cannot edit operational data

⸻

6. Core MVP Modules

6.1 Dashboard

Display:

* Today’s production
* Production against target
* Tonnes mined
* Tonnes processed
* Estimated recovery
* Fuel used
* Equipment availability
* Active workers
* Open maintenance issues
* Low-stock items
* Pending approvals
* Upcoming licence deadlines
* Recent safety incidents

⸻

6.2 Daily Production

Capture:

* Date
* Site
* Shift
* Mining area or pit
* Material type
* Ore tonnes
* Waste tonnes
* Tonnes processed
* Estimated grade
* Recovery percentage
* Product output
* Units
* Supervisor
* Supporting photos
* Notes
* Approval status

Production entries must be auditable and should not be permanently deleted.

⸻

6.3 Shift Management

Capture:

* Shift name
* Start time
* End time
* Supervisor
* Assigned workers
* Assigned equipment
* Planned target
* Actual production
* Delays
* Downtime
* Handover notes

⸻

6.4 Worker Management

Capture:

* Full name
* Employee or contractor number
* Phone number
* Role
* Employment type
* Assigned site
* Shift
* Attendance
* Emergency contact
* Training records
* PPE issued
* Status

⸻

6.5 Equipment Management

Capture:

* Equipment name
* Category
* Registration or serial number
* Ownership type
* Supplier
* Site
* Purchase or rental date
* Hour-meter reading
* Current status
* Fuel type
* Maintenance schedule
* Documents
* Photos

Statuses:

* Available
* In use
* Under maintenance
* Broken down
* Rented out
* Retired

⸻

6.6 Fuel Management

Capture:

* Fuel received
* Supplier
* Quantity
* Unit cost
* Storage tank
* Fuel issued
* Equipment or vehicle
* Operator
* Hour-meter reading
* Odometer
* Remaining balance
* Authorizer

The system should automatically calculate:

* Fuel balance
* Fuel cost
* Consumption per machine
* Consumption per operating hour
* Unusual fuel variance

⸻

6.7 Maintenance

Capture:

* Equipment
* Issue
* Reported date
* Priority
* Assigned technician
* Parts required
* Labour cost
* Spare-parts cost
* Downtime
* Repair status
* Completion date
* Next maintenance date

Statuses:

* Reported
* Diagnosing
* Waiting for parts
* In progress
* Completed
* Cancelled

⸻

6.8 Inventory

Inventory categories may include:

* Spare parts
* PPE
* Explosives-related consumables, subject to strict access controls
* Lubricants
* Tools
* Processing chemicals
* Office supplies
* Camp supplies

Functions:

* Stock receipts
* Stock issues
* Stock transfers
* Adjustments
* Minimum stock levels
* Reorder alerts
* Supplier records
* Stock valuation
* Damaged or missing stock reports

⸻

6.9 Expenses and Cost Tracking

Capture:

* Expense category
* Site
* Department
* Supplier
* Amount
* Payment method
* Receipt
* Approval status
* Related equipment
* Related production period
* Notes

Categories:

* Fuel
* Wages
* Equipment rental
* Maintenance
* Spare parts
* Transport
* Security
* Food and accommodation
* Laboratory costs
* Licence fees
* Environmental costs
* Professional services
* Other expenses

⸻

6.10 Compliance and Licences

Capture:

* Licence type
* Licence number
* Holder
* Issuing authority
* Mineral
* Region
* District
* Coordinates
* Issue date
* Expiry date
* Renewal deadline
* Annual fees
* Documents
* Compliance tasks
* Responsible officer

The system should send reminders before deadlines.

⸻

6.11 Safety and Incidents

Capture:

* Incident type
* Date and time
* Site
* Exact location
* Persons involved
* Severity
* Description
* Immediate action
* Root cause
* Corrective action
* Responsible person
* Deadline
* Photos
* Status

⸻

6.12 Reports

Initial reports:

* Daily production report
* Weekly production report
* Monthly production report
* Fuel-consumption report
* Equipment-utilization report
* Maintenance-cost report
* Inventory report
* Expense report
* Cost-per-tonne report
* Worker-attendance report
* Safety-incident report
* Licence-expiry report

Reports should be exportable to PDF, CSV, and Excel later.

⸻

7. Technical Architecture

Recommended Stack

Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* Responsive web application
* Progressive Web App support later

Backend

* Next.js server actions and API routes for the initial MVP
* Supabase PostgreSQL
* Supabase Authentication
* Supabase Storage
* Supabase Row Level Security

Hosting

* Vercel for the web application
* Supabase for database, authentication, and storage

Future Services

* Python service for geological AI and computer vision
* Object storage for drone and satellite files
* Mapbox or OpenStreetMap for mapping
* Background jobs for reports and alerts
* WhatsApp and SMS notifications
* IoT integrations for equipment and fuel sensors

⸻

8. Multi-Tenant Architecture

Mantara should support multiple mining companies from the beginning.

Every operational record must be linked to:

* Organization
* Mine site
* User
* Created date
* Updated date

Users must only access organizations and sites they are authorized to view.

The database should use Row Level Security to prevent one customer from accessing another customer’s information.

⸻

9. Offline and Low-Connectivity Support

Mining sites may have weak internet connectivity.

The product should eventually support:

* Mobile-friendly forms
* Draft records
* Local caching
* Upload retries
* Compressed images
* Offline data entry
* Synchronization when internet returns

The first MVP may start online-only, but the architecture should not make offline support impossible later.

⸻

10. Data and Audit Requirements

Important operational records must include:

* Created by
* Created at
* Updated by
* Updated at
* Approval status
* Approved by
* Approved at

Critical records should not be permanently deleted.

Use:

* Soft deletion
* Audit logs
* Approval workflows
* Change history

This is especially important for:

* Production
* Fuel
* Inventory
* Expenses
* Safety
* Compliance

⸻

11. Artificial Intelligence Principles

Mantara should not add AI simply for marketing.

AI should only be used where it reduces costs, detects risk, or improves decisions.

Initial AI functions should include:

* Daily report summaries
* Production anomaly detection
* Fuel-variance alerts
* Maintenance reminders
* Natural-language questions over company data
* Forecasting based on historical records

Advanced AI should only be introduced after sufficient reliable data has been collected.

⸻

12. MVP Success Criteria

The MVP will be successful when one mining operator can use Mantara to:

* Register a mining company
* Add a mine site
* Add workers
* Add equipment
* Record daily production
* Record fuel received and issued
* Record inventory movements
* Record equipment breakdowns
* Track expenses
* monitor licence deadlines
* Record incidents
* View operational dashboards
* Generate management reports
* Control user access
* Review a complete audit trail

⸻

13. Business Model

Possible pricing structure:

Starter

For one small mine site.

Includes:

* Production
* Workers
* Equipment
* Fuel
* Inventory
* Basic reports

Growth

For growing operators with several users or sites.

Includes:

* All Starter features
* Maintenance
* Compliance
* Safety
* Advanced reports
* Approval workflows
* Mantara Brain summaries

Enterprise

For medium and large mining companies.

Includes:

* Multiple organizations and sites
* Custom integrations
* GeoAI
* Vision
* IoT
* Advanced security
* Dedicated support
* Custom reporting

Additional revenue can come from:

* Setup fees
* Training
* Data migration
* Custom development
* Equipment integrations
* GeoAI analysis
* Drone analysis
* Marketplace commissions

⸻

14. Initial Build Priority

The development team should build in this order:

1. Project foundation
2. Authentication
3. Multi-tenant organizations
4. Mine sites
5. Roles and permissions
6. Dashboard shell
7. Workers
8. Equipment
9. Daily production
10. Fuel
11. Maintenance
12. Inventory
13. Expenses
14. Compliance
15. Safety
16. Reports
17. Notifications
18. Audit logs
19. Testing
20. Deployment

The first release should prioritize reliability and ease of use over advanced features.

Planning documents for Mantara OS MVP. These documents capture the repository assessment and the agreed foundation before operational modules are implemented.

- [Architecture and implementation plan](architecture.md)
