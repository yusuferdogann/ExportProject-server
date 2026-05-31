# Mongoose → Prisma Model Inventory
# Generated: 2026-05-14
# Source: C:\Users\OEM\Desktop\EportProject\server\models\ (36 files read, all non-empty)

---

## Report.js
collection: reports
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: tenantId
    type: String
  - name: type
    type: String
    required: true
    enum: [employee, monthly, weekly, tracking]
  - name: reportNo
    type: String
    required: true
  - name: reportType
    type: String
    required: true
  - name: senderId
    type: ObjectId
    ref: users
  - name: sender
    type: String
  - name: senderRole
    type: String
  - name: createdAt
    type: Date
    default: Date.now
  - name: periodStart
    type: Date
  - name: periodEnd
    type: Date
  - name: reportPeriod
    type: String
  - name: status
    type: String
    default: "Hazır"
  - name: reviewerId
    type: ObjectId
    ref: users
  - name: reviewer
    type: String
  - name: reviewDate
    type: Date
  - name: viewStatus
    type: String
    default: "Görülmedi"
  - name: fileType
    type: String
    default: "PDF"
  - name: fileUrl
    type: String
  - name: title
    type: String
  - name: contentHTML
    type: String
    default: ""
  - name: images
    type: Array
    arrayOf: String
    default: []
  - name: meta
    type: Mixed
    default: {}
indexes:
  - { companyId: 1, type: 1, createdAt: -1 }
  - { companyId: 1, reportNo: 1 } unique
hooks: []
notes:
  - createdAt is explicitly defined AND timestamps:true is set — timestamps will produce a duplicate createdAt field; the explicit one may shadow the auto one.

---

## facilitiyInfo.js
collection: facilityInfo
timestamps: false
fields:
  - name: companyId
    type: ObjectId
    required: true
    unique: true
    ref: companies
  - name: companyName
    type: String
  - name: cknNumber
    type: String
  - name: companyNumber
    type: String
  - name: companyMail
    type: String
  - name: companyWebsite
    type: String
  - name: fieldActivity
    type: String
  - name: closeArea
    type: String
  - name: openArea
    type: String
  - name: workerCount
    type: String
  - name: totalArea
    type: String
  - name: address
    type: String
  - name: companyLogo
    type: String
    default: ""
  - name: facilityId
    type: ObjectId
    required: false
    ref: facilities
    default: null
indexes: []
hooks: []
notes:
  - Filename has a typo: "facilitiy" instead of "facility".
  - facilityId references ref "facilities" but the actual collection from facility.js is "facility" (singular) — INCONSISTENT ref name.
  - companyId is unique, meaning one facilityInfo record per company.

---

## ApprovalStep.js
collection: ApprovalStep
timestamps: true
fields:
  - name: approvalId
    type: ObjectId
    required: true
    ref: Approval
  - name: stepOrder
    type: Number
    required: true
  - name: role
    type: String
    required: true
  - name: assignedTo
    type: ObjectId
    ref: users
  - name: status
    type: String
    enum: [pending, approved, rejected]
    default: "pending"
  - name: actionBy
    type: ObjectId
    ref: users
  - name: actionAt
    type: Date
  - name: comment
    type: String
indexes: []
hooks: []
notes:
  - Collection name "ApprovalStep" is PascalCase (unusual; most collections are lowercase plural).

---

## Company.js
collection: companies
timestamps: true
fields:
  - name: name
    type: String
    required: true
  - name: slug
    type: String
    required: true
    unique: true
  - name: isActive
    type: Boolean
    default: true
indexes: []
hooks: []
notes: []

---

## Product.js
collection: products
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: tenantId
    type: String
  - name: customerId
    type: ObjectId
    ref: customers
    default: null
  - name: createdBy
    type: ObjectId
    ref: users
    default: null
  - name: code
    type: String
    required: true
  - name: name
    type: String
    required: true
  - name: type
    type: String
  - name: unit
    type: String
    default: "Adet"
  - name: defaultPrice
    type: Number
    required: true
indexes:
  - { companyId: 1, code: 1 } unique
hooks: []
notes: []

---

## UsageLastPing.js
collection: usagelastpings
timestamps: true
fields:
  - name: userId
    type: ObjectId
    required: true
    unique: true
    ref: users
  - name: lastBeatAt
    type: Date
    required: true
indexes: []
hooks: []
notes: []

---

## RoleAssignmentLog.js
collection: roleassignmentlogs
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: targetUserId
    type: ObjectId
    required: true
    ref: users
  - name: roleName
    type: String
    required: true
  - name: roleType
    type: String
    required: true
    enum: [template, custom]
  - name: roleId
    type: ObjectId
    ref: (refPath → roleModel)
  - name: roleModel
    type: String
    enum: [roletemplates, customroles]
  - name: permissions
    type: Array
    arrayOf: String
    default: []
  - name: action
    type: String
    enum: [assigned, updated, removed]
    default: "assigned"
  - name: performedBy
    type: ObjectId
    required: true
    ref: users
  - name: details
    type: Mixed
    default: {}
indexes:
  - { companyId: 1, targetUserId: 1, createdAt: -1 }
hooks: []
notes:
  - roleId uses refPath: "roleModel" — POLYMORPHIC ref; resolves to either "roletemplates" or "customroles" based on roleModel field value.

---

## MandatoryReport.js
collection: MandatoryReport
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: workerId
    type: ObjectId
    required: true
    ref: users
  - name: deadlineDate
    type: Date
    required: true
  - name: periodType
    type: String
    enum: [günlük, haftalık, aylık]
    default: "aylık"
  - name: periodMonth
    type: Number
  - name: periodYear
    type: Number
indexes:
  - { companyId: 1, workerId: 1, periodYear: 1, periodMonth: 1 } unique
hooks: []
notes:
  - Collection name "MandatoryReport" is PascalCase singular (unusual).

---

## PotentialCustomerPackage.js
collection: potentialcustomerpackages
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: createdBy
    type: ObjectId
    required: true
    ref: users
  - name: sourceCatalogId
    type: String
    required: true
  - name: catalogSnapshot
    type: Mixed
    required: true
  - name: displayName
    type: String
    default: ""
  - name: managerNotes
    type: String
    default: ""
  - name: isActive
    type: Boolean
    default: true
indexes:
  - { companyId: 1, createdAt: -1 }
hooks: []
notes:
  - catalogSnapshot stores an arbitrary JSON snapshot of a potential customer card (Schema.Types.Mixed).

---

## Invoice.js
collection: Invoice
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: customerId
    type: ObjectId
    required: true
    ref: customers
  - name: invoiceNo
    type: String
    required: true
  - name: invoiceDate
    type: Date
    required: true
  - name: delivery
    type: String
  - name: destinationCountry
    type: String
  - name: gtip
    type: String
  - name: bank
    type: Object
    nested:
      - name: name
        type: String
      - name: branch
        type: String
      - name: swift
        type: String
      - name: iban
        type: String
  - name: products
    type: Array
    arrayOf: Object
    nested:
      - name: description
        type: String
      - name: quantity
        type: Number
        default: 0
      - name: unit
        type: String
      - name: unitPrice
        type: Number
        default: 0
      - name: total
        type: Number
        default: 0
  - name: totalAmount
    type: Number
    default: 0
  - name: status
    type: String
    enum: [draft, pending_approval, approved, rejected, cancelled, archived]
    default: "draft"
  - name: approvalId
    type: ObjectId
    ref: Approval
  - name: submittedAt
    type: Date
  - name: approvedAt
    type: Date
  - name: rejectedAt
    type: Date
  - name: document
    type: Object
    nested:
      - name: public_id
        type: String
      - name: secure_url
        type: String
      - name: asset_id
        type: String
      - name: version
        type: Number
      - name: resource_type
        type: String
        default: "raw"
  - name: documentStatus
    type: String
    enum: [pending, generated, failed]
    default: "pending"
  - name: isDeleted
    type: Boolean
    default: false
indexes:
  - { companyId: 1, invoiceNo: 1 } unique
hooks: []
notes:
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".
  - Collection name "Invoice" is PascalCase singular.
  - document.asset_id and document.version are only present here (not in Proforma/Checklist/PriceOffer document sub-objects).

---

## Approval.js
collection: Approval
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: createdBy
    type: ObjectId
    required: true
    ref: User
  - name: entityType
    type: String
    required: true
  - name: entityId
    type: ObjectId
    required: true
  - name: status
    type: String
    default: "pending"
  - name: currentStep
    type: Number
    default: 1
  - name: completedAt
    type: Date
indexes: []
hooks: []
notes:
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".
  - createdBy uses ref "User" (PascalCase) — INCONSISTENT; actual collection is "users".
  - entityId has NO ref — it is a polymorphic foreign key whose target is determined by entityType (e.g. "product", "leave", "Invoice", "Proforma", "Checklist", "PriceOffer"). This is a BLOCKER for Prisma schema generation.
  - Collection name "Approval" is PascalCase singular.

---

## ProductDiscount.js
collection: productdiscounts
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: productId
    type: ObjectId
    required: true
    ref: products
  - name: productName
    type: String
  - name: productType
    type: String
  - name: userId
    type: ObjectId
    required: true
    ref: users
  - name: discountPercent
    type: Number
    required: true
indexes:
  - { companyId: 1, productId: 1, userId: 1 } unique
hooks: []
notes: []

---

## MailAiUsageLog.js
collection: mailaiusagelogs
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: userId
    type: ObjectId
    required: true
    ref: users
  - name: operation
    type: String
    required: true
    enum: [proofread, translate]
indexes:
  - { companyId: 1, createdAt: -1 }
hooks: []
notes: []

---

## MonthlyUsageMinute.js
collection: monthlyusageminutes
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: userId
    type: ObjectId
    required: true
    ref: users
  - name: customerScopeKey
    type: String
    default: "_"
  - name: yearMonth
    type: String
    required: true
  - name: minutes
    type: Number
    default: 0
indexes:
  - { companyId: 1, userId: 1, yearMonth: 1, customerScopeKey: 1 } unique
hooks: []
notes:
  - customerScopeKey defaults to "_" when there is no customer page context.

---

## Worker.js
collection: workers
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: name
    type: String
    required: true
  - name: title
    type: String
  - name: phone
    type: String
  - name: email
    type: String
  - name: avatar
    type: String
  - name: userId
    type: ObjectId
    ref: users
  - name: parentId
    type: ObjectId
    ref: workers
    default: null
indexes: []
hooks: []
notes:
  - parentId is a self-referential FK (workers.parentId → workers) — hierarchical worker tree.

---

## Customers.js
collection: customers
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: firmName
    type: String
    required: true
  - name: country
    type: String
  - name: address
    type: String
  - name: code
    type: String
  - name: phone
    type: String
  - name: mail
    type: String
  - name: website
    type: String
  - name: personName
    type: String
  - name: personTitle
    type: String
  - name: saveDate
    type: Date
    default: Date.now
  - name: isActive
    type: Boolean
    default: true
indexes: []
hooks: []
notes:
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".

---

## InterviewReminderSettings.js
collection: interview_reminder_settings
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: descriptionKey
    type: String
    required: true
  - name: value
    type: Number
    required: true
  - name: unit
    type: String
    required: true
    enum: [dakika, saat, gun, hafta, ay]
indexes:
  - { companyId: 1, descriptionKey: 1 } unique
hooks: []
notes:
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".
  - Collection name uses snake_case (interview_reminder_settings) — unusual in this codebase.

---

## facility.js
collection: facility
timestamps: false
fields:
  - name: city
    type: String
    required: true
  - name: country
    type: String
    required: true
  - name: employeecount
    type: String
  - name: facilityname
    type: String
    required: true
  - name: company_logo
    type: String
    default: "default.jpg"
  - name: state
    type: String
    required: true
  - name: totalarea
    type: String
    required: true
  - name: latitude
    type: String
    required: true
  - name: longitude
    type: String
    required: true
  - name: CityCode
    type: String
    required: true
  - name: FieldActivity
    type: String
    required: true
  - name: userId
    type: ObjectId
    required: true
    ref: users
indexes: []
hooks: []
notes:
  - Collection name is "facility" (singular). facilitiyInfo.js erroneously references "facilities" (plural).
  - Field names use inconsistent casing: camelCase (employeecount), PascalCase (CityCode, FieldActivity), snake_case (company_logo).
  - latitude and longitude are stored as String, not Number.
  - No timestamps.

---

## Reminders.js
collection: reminders
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: customerId
    type: ObjectId
    required: true
    ref: customers
  - name: createdBy
    type: ObjectId
    ref: users
  - name: title
    type: String
    required: true
  - name: description
    type: String
    default: ""
  - name: date
    type: Date
    required: true
  - name: time
    type: String
    required: true
  - name: notificationSent
    type: Boolean
    default: false
indexes: []
hooks: []
notes:
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".

---

## Proforma.js
collection: Proforma
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: customerId
    type: ObjectId
    required: true
    ref: customers
  - name: delivery
    type: Object
    nested:
      - name: type
        type: String
      - name: vehicle
        type: String
      - name: point
        type: String
  - name: quoteNumber
    type: String
    required: true
  - name: invoiceDate
    type: Date
    required: true
  - name: validUntil
    type: Date
    required: true
  - name: bankInfo
    type: Object
    nested:
      - name: name
        type: String
      - name: branch
        type: String
      - name: swiftCode
        type: String
      - name: iban
        type: String
  - name: originCountry
    type: String
  - name: gtipCode
    type: String
  - name: note
    type: String
  - name: totalNetWeight
    type: Number
    default: 0
  - name: totalGrossWeight
    type: Number
    default: 0
  - name: totalPackageCount
    type: Number
    default: 0
  - name: status
    type: String
    enum: [draft, pending_approval, approved, rejected, cancelled]
    default: "draft"
  - name: approvalId
    type: ObjectId
    ref: Approval
  - name: submittedAt
    type: Date
  - name: approvedAt
    type: Date
  - name: rejectedAt
    type: Date
  - name: document
    type: Object
    nested:
      - name: public_id
        type: String
      - name: secure_url
        type: String
      - name: resource_type
        type: String
        default: "raw"
indexes: []
hooks: []
notes:
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".
  - Collection name "Proforma" is PascalCase singular.
  - delivery.type field: to avoid conflict with Mongoose's reserved "type" keyword, the sub-field is declared as { type: { type: String } }. Same pattern in PriceOffer.js.

---

## WorkerNote.js
collection: WorkerNote
timestamps: true
fields:
  - name: title
    type: String
    required: true
  - name: description
    type: String
    required: true
  - name: createdDate
    type: Date
    default: Date.now
  - name: status
    type: String
    enum: [open, in_progress, completed]
    default: "open"
  - name: read
    type: Boolean
    default: false
  - name: tenantId
    type: ObjectId
    required: true
    ref: Tenant
  - name: customerId
    type: ObjectId
    required: true
    ref: Customer
indexes: []
hooks: []
notes:
  - tenantId references ref "Tenant" — NO matching collection in this codebase. BLOCKER.
  - customerId references ref "Customer" (PascalCase singular) — INCONSISTENT; actual collection is "customers".
  - Collection name "WorkerNote" is PascalCase singular.
  - No companyId field — tenant isolation relies on tenantId which maps to an unknown collection.

---

## Meetings.js
collection: meeties
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: customerId
    type: ObjectId
    required: true
    ref: customers
  - name: firmName
    type: String
    required: true
  - name: mail
    type: String
  - name: phone
    type: String
  - name: status
    type: String
    required: true
  - name: recordDate
    type: Date
    default: Date.now
indexes: []
hooks: []
notes:
  - Collection name is "meeties" — likely a typo for "meetings" or "meeties" is intentional slang. INCONSISTENT naming.
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".
  - status has no enum — any string is accepted.

---

## WorkOrder.js
collection: workorders
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: senderId
    type: ObjectId
    required: true
    ref: users
  - name: receiverId
    type: ObjectId
    required: true
    ref: users
  - name: title
    type: String
    required: true
  - name: content
    type: String
    required: true
  - name: status
    type: String
    enum: [pending, in_progress, done]
    default: "pending"
indexes: []
hooks: []
notes: []

---

## CalendarEvents.js
collection: CalendarEvent
timestamps: true
fields:
  - name: title
    type: String
    required: true
  - name: description
    type: String
  - name: date
    type: Date
  - name: startDate
    type: Date
  - name: endDate
    type: Date
  - name: tenantId
    type: ObjectId
    required: true
    ref: Tenant
  - name: customerId
    type: ObjectId
    required: true
    ref: Customer
  - name: assignedTo
    type: ObjectId
    ref: users
  - name: assignedToName
    type: String
  - name: creatorName
    type: String
indexes: []
hooks: []
notes:
  - tenantId references ref "Tenant" — NO matching collection in this codebase. BLOCKER.
  - customerId references ref "Customer" (PascalCase singular) — INCONSISTENT; actual collection is "customers".
  - Collection name "CalendarEvent" is PascalCase singular.
  - Both date (legacy) and startDate/endDate fields exist for backward compatibility.
  - No companyId field.

---

## Message.js
collection: messages
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: senderId
    type: ObjectId
    required: true
    ref: users
  - name: receiverId
    type: ObjectId
    required: true
    ref: users
  - name: content
    type: String
    required: true
  - name: isRead
    type: Boolean
    default: false
  - name: label
    type: String
indexes: []
hooks: []
notes: []

---

## Checklist.js
collection: Checklist
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: customerId
    type: ObjectId
    ref: customers
    default: null
  - name: invoiceNumber
    type: String
    required: true
  - name: truckPlate
    type: String
  - name: invoiceDate
    type: Date
  - name: gtipCode
    type: String
  - name: originCountry
    type: String
  - name: masterPackageUnit
    type: String
  - name: grandTotalKgs
    type: Number
  - name: sellerName
    type: String
  - name: sellerAddress
    type: String
  - name: sellerPhone
    type: String
  - name: sellerEmail
    type: String
  - name: sellerTaxId
    type: String
  - name: sellerTaxOffice
    type: String
  - name: sellerWebsite
    type: String
  - name: customerAddress
    type: String
  - name: customerEmail
    type: String
  - name: customerPhone
    type: String
  - name: note
    type: String
  - name: products
    type: Array
    arrayOf: Object
    nested:
      - name: code
        type: String
      - name: name
        type: String
      - name: master
        type: String
      - name: qty
        type: Number
        default: 0
      - name: net
        type: Number
        default: 0
      - name: gross
        type: Number
        default: 0
      - name: price
        type: Number
        default: 0
  - name: totalPrice
    type: Number
    default: 0
  - name: totalNetWeight
    type: Number
    default: 0
  - name: totalGrossWeight
    type: Number
    default: 0
  - name: totalPackageCount
    type: Number
    default: 0
  - name: status
    type: String
    enum: [draft, pending_approval, approved, rejected, cancelled]
    default: "draft"
  - name: approvalId
    type: ObjectId
    ref: Approval
  - name: submittedAt
    type: Date
  - name: approvedAt
    type: Date
  - name: rejectedAt
    type: Date
  - name: document
    type: Object
    nested:
      - name: public_id
        type: String
      - name: secure_url
        type: String
      - name: resource_type
        type: String
        default: "raw"
  - name: language
    type: String
    enum: [tr, en]
    default: "tr"
indexes: []
hooks: []
notes:
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".
  - Collection name "Checklist" is PascalCase singular.

---

## PriceOffer.js
collection: pricequotes
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: customerId
    type: ObjectId
    required: true
    ref: customers
  - name: products
    type: Array
    arrayOf: Object
    nested:
      - name: name
        type: String
        required: true
      - name: unit
        type: String
      - name: quantity
        type: Number
        required: true
      - name: price
        type: Number
        required: true
      - name: photo
        type: String
        default: ""
      - name: total
        type: Number
        required: true
  - name: delivery
    type: Object
    nested:
      - name: type
        type: String
      - name: vehicle
        type: String
      - name: point
        type: String
  - name: priceInfo
    type: Object
    nested:
      - name: quoteNumber
        type: String
        required: true
      - name: invoiceDate
        type: Date
        required: true
      - name: validUntil
        type: Date
        required: true
  - name: destinationCountry
    type: String
    required: true
  - name: status
    type: String
    enum: [draft, pending_approval, approved, rejected, cancelled]
    default: "draft"
  - name: approvalId
    type: ObjectId
    ref: Approval
  - name: submittedAt
    type: Date
  - name: approvedAt
    type: Date
  - name: rejectedAt
    type: Date
  - name: document
    type: Object
    nested:
      - name: public_id
        type: String
      - name: secure_url
        type: String
      - name: resource_type
        type: String
        default: "raw"
indexes: []
hooks: []
notes:
  - File is named PriceOffer.js but schema is PriceQuoteSchema and collection is "pricequotes". Naming mismatch.
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".
  - delivery.type field uses Mongoose's nested-type syntax to avoid keyword conflict.

---

## Notification.js
collection: notifications
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: userId
    type: ObjectId
    required: true
    ref: users
  - name: title
    type: String
    required: true
  - name: description
    type: String
    required: true
  - name: isRead
    type: Boolean
    default: false
  - name: type
    type: String
    default: "info"
indexes: []
hooks: []
notes: []

---

## ApprovalLogs.js
collection: ApprovalLog
timestamps: true
fields:
  - name: approvalId
    type: ObjectId
    required: true
    ref: Approval
  - name: stepId
    type: ObjectId
    ref: ApprovalStep
  - name: action
    type: String
    required: true
  - name: userId
    type: ObjectId
    ref: users
  - name: comment
    type: String
  - name: createdAt
    type: Date
    default: Date.now
indexes: []
hooks: []
notes:
  - File is named ApprovalLogs.js (plural) but collection is "ApprovalLog" (PascalCase singular).
  - createdAt is explicitly defined in the schema AND timestamps:true is also set — duplicate field. The manual definition with default:Date.now will shadow the auto-generated one.
  - action has no enum — valid values documented in comment only (created | approved | rejected | delegated | commented).

---

## Notes.js
collection: noties
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: company
  - name: customerId
    type: ObjectId
    required: true
    ref: customers
  - name: title
    type: String
    required: true
  - name: description
    type: String
    required: true
  - name: date
    type: Date
    default: Date.now
indexes: []
hooks: []
notes:
  - Collection name is "noties" — likely a typo for "notes". INCONSISTENT naming.
  - companyId uses ref "company" (singular) — INCONSISTENT; actual collection is "companies".

---

## scopes.js
collection: data
timestamps: false
fields:
  - name: tarih
    type: String
  - name: title
    type: String
  - name: cartype
    type: String
  - name: subtitle
    type: String
  - name: situation
    type: String
  - name: sehir
    type: String
  - name: ulke
    type: String
  - name: ilce
    type: String
  - name: birim
    type: String
  - name: miktar
    type: Number
  - name: kaynak
    type: String
  - name: tesis
    type: String
  - name: type
    type: String
  - name: yakitturu
    type: String
  - name: plaka
    type: String
  - name: gasType
    type: String
  - name: user
    type: ObjectId
    required: true
    ref: users
indexes: []
hooks: []
notes:
  - File is named scopes.js but the collection registered is "data" and the schema is internally called UserSchema — extremely misleading naming.
  - Fields are Turkish-language (tarih=date, sehir=city, ulke=country, ilce=district, birim=unit, miktar=amount, kaynak=source, tesis=facility, yakitturu=fuel type, plaka=license plate).
  - Appears to be an energy/fuel consumption tracking model, unrelated to "scopes".
  - No companyId — uses "user" FK only.
  - No timestamps.

---

## MailTemplate.js
collection: mailtemplates
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: name
    type: String
    required: true
  - name: subject
    type: String
    default: ""
  - name: body
    type: String
    default: ""
  - name: order
    type: Number
    default: 0
  - name: createdBy
    type: ObjectId
    ref: users
indexes:
  - { companyId: 1, order: 1 }
hooks: []
notes: []

---

## BankInfo.js
collection: bankinfos
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: bankName
    type: String
    required: true
  - name: sube
    type: String
  - name: switch
    type: String
  - name: iban
    type: String
    required: true
  - name: status
    type: String
    enum: [bekliyor, onaylandi, reddedildi, revize]
    default: "bekliyor"
  - name: accountHolder
    type: String
indexes: []
hooks: []
notes:
  - Field "switch" likely means SWIFT code (typo or intentional abbreviation).
  - Status enum values are Turkish (bekliyor=waiting, onaylandi=approved, reddedildi=rejected, revize=revision).

---

## CustomRole.js
collection: customroles
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: name
    type: String
    required: true
  - name: permissions
    type: Array
    arrayOf: String
    default: []
  - name: createdBy
    type: ObjectId
    required: true
    ref: users
  - name: assignedUserIds
    type: Array
    arrayOf: ObjectId
    ref: users
    default: []
indexes:
  - { companyId: 1, name: 1 } unique
hooks: []
notes:
  - assignedUserIds is an array of ObjectIds referencing "users" — many-to-many stored denormalized in the role document.

---

## User.js
collection: users
timestamps: false
fields:
  - name: email
    type: String
    required: true
    unique: true
  - name: role
    type: String
    required: true
    enum: [owner, foreign_trade_manager, general_manager, finance_manager, administrator, demo, employee]
    default: "demo"
  - name: permissions
    type: Array
    arrayOf: String
    default: []
  - name: roleTemplateId
    type: ObjectId
    ref: roletemplates
    default: null
  - name: customRoleId
    type: ObjectId
    ref: customroles
    default: null
  - name: reportLimit
    type: Number
  - name: facilityLimit
    type: Number
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: username
    type: String
    required: true
  - name: password
    type: String
    required: true
    minlength: 4
  - name: createdAt
    type: Date
    default: Date.now
indexes: []
hooks:
  - pre('save') — sets reportLimit and facilityLimit from role limits map (values include Infinity for administrator, general_manager, owner)
  - pre('save') — bcrypt hashes password if modified
notes:
  - reportLimit and facilityLimit are set via pre('save') hook from a hardcoded limits map. Values for administrator, general_manager, and owner are set to Infinity. Infinity is not a valid JSON/SQL value and cannot be stored in Prisma Int/Float columns directly — BLOCKER.
  - User.genereteJwtFromUser() is a schema method (note: typo "generte" instead of "generate").
  - No timestamps option; createdAt defined manually.
  - password stored as bcrypt hash.
  - Role-based permission merging happens in the JWT method, not in the DB.

---

## RoleTemplate.js
collection: roletemplates
timestamps: true
fields:
  - name: companyId
    type: ObjectId
    required: true
    ref: companies
  - name: name
    type: String
    required: true
  - name: description
    type: String
    default: ""
  - name: permissions
    type: Array
    arrayOf: String
    default: []
  - name: isSystem
    type: Boolean
    default: false
indexes:
  - { companyId: 1, name: 1 } unique
hooks: []
notes: []

---

## SUMMARY

### All collection names found (36)

| # | File | Collection Name |
|---|------|----------------|
| 1 | Report.js | reports |
| 2 | facilitiyInfo.js | facilityInfo |
| 3 | ApprovalStep.js | ApprovalStep |
| 4 | Company.js | companies |
| 5 | Product.js | products |
| 6 | UsageLastPing.js | usagelastpings |
| 7 | RoleAssignmentLog.js | roleassignmentlogs |
| 8 | MandatoryReport.js | MandatoryReport |
| 9 | PotentialCustomerPackage.js | potentialcustomerpackages |
| 10 | Invoice.js | Invoice |
| 11 | Approval.js | Approval |
| 12 | ProductDiscount.js | productdiscounts |
| 13 | MailAiUsageLog.js | mailaiusagelogs |
| 14 | MonthlyUsageMinute.js | monthlyusageminutes |
| 15 | Worker.js | workers |
| 16 | Customers.js | customers |
| 17 | InterviewReminderSettings.js | interview_reminder_settings |
| 18 | facility.js | facility |
| 19 | Reminders.js | reminders |
| 20 | Proforma.js | Proforma |
| 21 | WorkerNote.js | WorkerNote |
| 22 | Meetings.js | meeties |
| 23 | WorkOrder.js | workorders |
| 24 | CalendarEvents.js | CalendarEvent |
| 25 | Message.js | messages |
| 26 | Checklist.js | Checklist |
| 27 | PriceOffer.js | pricequotes |
| 28 | Notification.js | notifications |
| 29 | ApprovalLogs.js | ApprovalLog |
| 30 | Notes.js | noties |
| 31 | scopes.js | data |
| 32 | MailTemplate.js | mailtemplates |
| 33 | BankInfo.js | bankinfos |
| 34 | CustomRole.js | customroles |
| 35 | User.js | users |
| 36 | RoleTemplate.js | roletemplates |

### All foreign-key (ref) relationships

```
reports.companyId           -> companies
reports.senderId            -> users
reports.reviewerId          -> users
facilityInfo.companyId      -> companies
facilityInfo.facilityId     -> facilities  [MISMATCH: actual collection is "facility"]
ApprovalStep.approvalId     -> Approval
ApprovalStep.assignedTo     -> users
ApprovalStep.actionBy       -> users
products.companyId          -> companies
products.customerId         -> customers
products.createdBy          -> users
usagelastpings.userId       -> users
roleassignmentlogs.companyId    -> companies
roleassignmentlogs.targetUserId -> users
roleassignmentlogs.roleId       -> roletemplates OR customroles  [POLYMORPHIC via refPath]
roleassignmentlogs.performedBy  -> users
MandatoryReport.companyId   -> companies
MandatoryReport.workerId    -> users
potentialcustomerpackages.companyId -> companies
potentialcustomerpackages.createdBy -> users
Invoice.companyId           -> company     [MISMATCH: actual collection is "companies"]
Invoice.customerId          -> customers
Invoice.approvalId          -> Approval
Approval.companyId          -> company     [MISMATCH: actual collection is "companies"]
Approval.createdBy          -> User        [MISMATCH: actual collection is "users"]
Approval.entityId           -> (none — polymorphic, determined by entityType field)
productdiscounts.companyId  -> companies
productdiscounts.productId  -> products
productdiscounts.userId     -> users
mailaiusagelogs.companyId   -> companies
mailaiusagelogs.userId      -> users
monthlyusageminutes.companyId -> companies
monthlyusageminutes.userId  -> users
workers.companyId           -> companies
workers.userId              -> users
workers.parentId            -> workers     [SELF-REFERENTIAL]
customers.companyId         -> company     [MISMATCH: actual collection is "companies"]
interview_reminder_settings.companyId -> company [MISMATCH: actual collection is "companies"]
facility.userId             -> users
reminders.companyId         -> company     [MISMATCH: actual collection is "companies"]
reminders.customerId        -> customers
reminders.createdBy         -> users
Proforma.companyId          -> company     [MISMATCH: actual collection is "companies"]
Proforma.customerId         -> customers
Proforma.approvalId         -> Approval
WorkerNote.tenantId         -> Tenant      [UNKNOWN: no matching collection]
WorkerNote.customerId       -> Customer    [MISMATCH: actual collection is "customers"]
meeties.companyId           -> company     [MISMATCH: actual collection is "companies"]
meeties.customerId          -> customers
workorders.companyId        -> companies
workorders.senderId         -> users
workorders.receiverId       -> users
CalendarEvent.tenantId      -> Tenant      [UNKNOWN: no matching collection]
CalendarEvent.customerId    -> Customer    [MISMATCH: actual collection is "customers"]
CalendarEvent.assignedTo    -> users
messages.companyId          -> companies
messages.senderId           -> users
messages.receiverId         -> users
Checklist.companyId         -> company     [MISMATCH: actual collection is "companies"]
Checklist.customerId        -> customers
Checklist.approvalId        -> Approval
pricequotes.companyId       -> company     [MISMATCH: actual collection is "companies"]
pricequotes.customerId      -> customers
pricequotes.approvalId      -> Approval
notifications.companyId     -> companies
notifications.userId        -> users
ApprovalLog.approvalId      -> Approval
ApprovalLog.stepId          -> ApprovalStep
ApprovalLog.userId          -> users
noties.companyId            -> company     [MISMATCH: actual collection is "companies"]
noties.customerId           -> customers
data.user                   -> users
mailtemplates.companyId     -> companies
mailtemplates.createdBy     -> users
bankinfos.companyId         -> companies
customroles.companyId       -> companies
customroles.createdBy       -> users
customroles.assignedUserIds -> users       [ARRAY of ObjectIds]
users.companyId             -> companies
users.roleTemplateId        -> roletemplates
users.customRoleId          -> customroles
roletemplates.companyId     -> companies
```

---

## BLOCKERS

The following issues will require decisions before a Prisma schema can be generated:

### B1 — Polymorphic ref via refPath (RoleAssignmentLog.roleId)
- **Field:** `roleassignmentlogs.roleId` uses `refPath: "roleModel"`, resolving to either `"roletemplates"` or `"customroles"` based on the sibling `roleModel` field.
- **Prisma impact:** Prisma does not support refPath/polymorphic relations natively. Must be split into two nullable FK fields (`roleTemplateId`, `customRoleId`) and enforced at app level, OR stored as a raw String/ObjectId with no relation.

### B2 — Polymorphic FK without any ref (Approval.entityId)
- **Field:** `Approval.entityId` is an ObjectId with no `ref`. The target collection is determined at runtime by `Approval.entityType` (e.g. "Invoice", "Proforma", "Checklist", "PriceOffer").
- **Prisma impact:** Prisma cannot model this as a relation. Options: (a) store as raw `String` (hex ObjectId); (b) add explicit optional FK columns per entity type; (c) use a union/discriminated-union pattern with separate pivot tables.

### B3 — Unknown collection refs: "Tenant" and "Customer" (PascalCase)
- **Affected models:** `WorkerNote.tenantId`, `CalendarEvents.tenantId` both reference `ref: "Tenant"`. `WorkerNote.customerId` and `CalendarEvents.customerId` reference `ref: "Customer"`.
- **Prisma impact:** No model named "Tenant" or "Customer" exists in this codebase. These FKs cannot be mapped to a Prisma relation without knowing the intended target. They may be legacy references to a different database or a removed model.

### B4 — Infinity values in User.reportLimit / User.facilityLimit
- **Source:** `User.js` pre('save') hook sets `reportLimit = Infinity` and `facilityLimit = Infinity` for roles: administrator, general_manager, owner.
- **Prisma impact:** Neither `Int` nor `Float` Prisma types can store JavaScript `Infinity`. Must replace with a sentinel value (e.g. `-1` for unlimited) or use a separate boolean `isUnlimited` flag, or use `String` type.

### B5 — Inconsistent "company" vs "companies" ref names (12 models)
- **Affected fields:** Invoice.companyId, Approval.companyId, Customers.companyId, InterviewReminderSettings.companyId, Reminders.companyId, Proforma.companyId, Meetings.companyId (meeties), Checklist.companyId, PriceOffer.companyId (pricequotes), Notes.companyId (noties), WorkerNote (no companyId).
- **Prisma impact:** All of these should point to the `companies` collection (Company model). In Prisma, all these become `companyId String / company Company @relation(...)`. No ambiguity once normalized, but must be explicitly confirmed.

### B6 — Inconsistent casing in ref names: "User" vs "users" (Approval.createdBy)
- **Field:** `Approval.createdBy` uses `ref: "User"` (PascalCase). The actual collection is `users`.
- **Prisma impact:** Must be mapped to `users` / `User` model in Prisma.

### B7 — "facilities" vs "facility" mismatch (facilitiyInfo.facilityId)
- **Field:** `facilityInfo.facilityId` references `ref: "facilities"` (plural). The actual collection registered in `facility.js` is `"facility"` (singular).
- **Prisma impact:** Must resolve to `facility` (singular) model in Prisma.

### B8 — Duplicate createdAt field with timestamps:true (Report.js, ApprovalLogs.js)
- **Affected models:** `reports` (Report.js) and `ApprovalLog` (ApprovalLogs.js) both define `createdAt` explicitly in the schema AND have `{ timestamps: true }`.
- **Prisma impact:** In Prisma, `createdAt DateTime @default(now())` should appear once. No conflict once deduplicated.

### B9 — Typo/misleading collection names
- `meeties` (Meetings.js) — likely intended as `meetings`.
- `noties` (Notes.js) — likely intended as `notes`.
- `facilityInfo` collection from `facilitiyInfo.js` (filename has extra 'i': "facilitiy").
- `data` collection from `scopes.js` — filename does not reflect purpose at all.
- **Prisma impact:** Collection/table names must be chosen deliberately with `@@map(...)` in Prisma if the corrected names differ from the MongoDB collection names.

### B10 — Self-referential FK (Worker.parentId)
- **Field:** `workers.parentId` references `ref: "workers"` (same collection).
- **Prisma impact:** Supported in Prisma as a self-relation: `parent Worker? @relation("WorkerHierarchy", fields: [parentId], references: [id])`. Must define both sides of the relation.

### B11 — Array of ObjectIds as embedded list (CustomRole.assignedUserIds)
- **Field:** `customroles.assignedUserIds` is `[Schema.Types.ObjectId]` — a raw embedded array of user IDs.
- **Prisma impact:** Cannot be a direct Prisma relation array. Must be replaced with an explicit join table (e.g. `CustomRoleUser`) or a `String[]` raw list.

### B12 — Mixed/unstructured JSON fields
- `reports.meta` — `Schema.Types.Mixed`, default `{}`
- `roleassignmentlogs.details` — `Schema.Types.Mixed`, default `{}`
- `potentialcustomerpackages.catalogSnapshot` — `Schema.Types.Mixed`, required
- **Prisma impact:** Map to `Json` type in Prisma. Requires PostgreSQL or MySQL (not SQLite). Validation must be done at application level.

### B13 — Embedded subdocument arrays (not FK-linked)
- `Invoice.products`, `Checklist.products`, `PriceOffer.products` — arrays of plain subdocuments (not referencing the `products` collection).
- `Invoice.bank`, `Proforma.bankInfo`, `Proforma.delivery`, `PriceOffer.delivery`, `PriceOffer.priceInfo`, `Checklist.document`, etc. — nested objects.
- **Prisma impact:** Must either (a) flatten into columns, (b) extract into child tables with FK back to parent, or (c) store as `Json`. Option (c) is simplest for migration but loses queryability.
