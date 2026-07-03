/// <reference path="../pb_data/types.d.ts" />
// Adds email-verification fields to the customers collection: accounts start
// unverified and must confirm a code emailed to them before they can sign in.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_108570809")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool2988318933",
    "name": "emailVerified",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text9000000001",
    "max": 0,
    "min": 0,
    "name": "verifyPin",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text9000000002",
    "max": 0,
    "min": 0,
    "name": "verifyPinExpires",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_108570809")

  for (const name of ["emailVerified", "verifyPin", "verifyPinExpires"]) {
    const field = collection.fields.getByName(name)
    if (field) collection.fields.removeById(field.id)
  }

  return app.save(collection)
})
