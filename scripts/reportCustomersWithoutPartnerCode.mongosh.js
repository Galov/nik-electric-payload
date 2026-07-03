const users = db
  .getCollection('users')
  .find(
    {
      approved: true,
      partnerCode: { $in: [null, ''] },
      roles: 'customer',
    },
    {
      approved: 1,
      companyName: 1,
      email: 1,
      firstName: 1,
      lastName: 1,
      legacyWPUserId: 1,
      partnerCode: 1,
      roles: 1,
    },
  )
  .sort({ createdAt: -1 })
  .toArray()

printjson(users)
