const users = db.getCollection('users')

printjson({
  approvedCustomers: users.countDocuments({ roles: 'customer', approved: true }),
  approvedCustomersWithPartnerCode: users.countDocuments({
    roles: 'customer',
    approved: true,
    partnerCode: { $exists: true, $ne: '' },
  }),
  customers: users.countDocuments({ roles: 'customer' }),
  customersWithPartnerCode: users.countDocuments({
    roles: 'customer',
    partnerCode: { $exists: true, $ne: '' },
  }),
  total: users.countDocuments({}),
})
