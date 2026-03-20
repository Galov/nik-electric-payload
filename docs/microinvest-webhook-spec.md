# Microinvest Webhook Spec

Първа inbound версия за синхронизация `Microinvest -> сайт`.

## Endpoint

`POST /api/integrations/microinvest/webhook`

Текущ тестов адрес:

`http://65.21.176.78:3000/api/integrations/microinvest/webhook`

## Authentication

Задължителен header:

`x-microinvest-secret: <shared-secret>`

Стойността трябва да съвпада с `MICROINVEST_WEBHOOK_SECRET` в средата на сайта.

## Match Key

Продуктите се match-ват по `sku`.

Ако подаденото `sku` не съществува в сайта, endpoint-ът връща `404`.

## Supported Events

- `product.updated`
- `stock.updated`
- `price.updated`
- `product.deactivated`

## JSON Payload

```json
{
  "event": "product.updated",
  "timestamp": "2026-03-19T12:00:00Z",
  "sku": "110BH01",
  "data": {
    "title": "Нагревател Bosch Siemens",
    "price": 12.39,
    "stockQty": 7,
    "published": true,
    "originalSku": "00438301",
    "manufacturerCode": "ORIGINAL",
    "description": "Дълго описание",
    "shortDescription": "Кратко описание"
  }
}
```

## Example Payloads

### `stock.updated`

```json
{
  "event": "stock.updated",
  "timestamp": "2026-03-19T12:00:00Z",
  "sku": "110BH01",
  "data": {
    "stockQty": 11
  }
}
```

### `price.updated`

```json
{
  "event": "price.updated",
  "timestamp": "2026-03-19T12:05:00Z",
  "sku": "110BH01",
  "data": {
    "price": 19.99
  }
}
```

### `product.updated`

```json
{
  "event": "product.updated",
  "timestamp": "2026-03-19T12:10:00Z",
  "sku": "110BH01",
  "data": {
    "title": "Нагревател Bosch Siemens",
    "price": 19.99,
    "stockQty": 11,
    "published": true,
    "originalSku": "00438301",
    "manufacturerCode": "ORIGINAL",
    "description": "Дълго описание",
    "shortDescription": "Кратко описание"
  }
}
```

### `product.deactivated`

```json
{
  "event": "product.deactivated",
  "timestamp": "2026-03-19T12:15:00Z",
  "sku": "110BH01"
}
```

## Field Mapping

- `sku` -> `products.sku`
- `data.title` -> `products.title`
- `data.price` -> `products.price`
- `data.stockQty` -> `products.stockQty`
- `data.stockQty > 0` -> `stockStatus = instock`
- `data.stockQty <= 0` -> `stockStatus = outofstock`
- `data.published` -> `products.published`
- `data.originalSku` -> `products.originalSku`
- `data.manufacturerCode` -> `products.manufacturerCode`
- `data.description` -> `products.description`
- `data.shortDescription` -> `products.shortDescription`

При `product.deactivated`:

- `published = false`
- `stockQty = 0`
- `stockStatus = outofstock`

## Success Response

```json
{
  "event": "stock.updated",
  "message": "Webhook processed successfully.",
  "productId": "67d9a6...",
  "sku": "110BH01",
  "timestamp": "2026-03-19T12:00:00Z",
  "updatedFields": ["stockQty", "stockStatus"]
}
```

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Unauthorized."
}
```

### 400 Invalid Request

```json
{
  "error": "Missing sku."
}
```

или

```json
{
  "error": "Unsupported event."
}
```

или

```json
{
  "error": "Invalid JSON body."
}
```

### 404 Product Not Found

```json
{
  "error": "Product not found.",
  "sku": "110BH01"
}
```

## Notes

- Това е първа версия за inbound sync.
- Endpoint-ът е тестван успешно върху staging среда.
- По-късно може да се добавят batch payload-и.
- По-късно може да се добави HMAC подпис вместо shared secret.
- Поръчките `сайт -> Microinvest` са отделен поток и не са част от този endpoint.
- За production по-късно тестовият IP адрес ще бъде заменен с домейн.
