# Спецификация на webhook-а от Microinvest v2

Този документ описва само полетата и сценариите, които вече са имплементирани и могат да бъдат тествани веднага.

## Адрес

`POST /api/integrations/microinvest/webhook`

Текущ тестов адрес:

`http://65.21.176.78:3000/api/integrations/microinvest/webhook`

## Достъп

Задължителен header:

`x-microinvest-secret: test-microinvest-secret`

## Ключ за разпознаване на продукта

Продуктите се разпознават по `sku`.

Ако подаденото `sku` не съществува в сайта, endpoint-ът връща `404`.

## Поддържани събития

- `stock.updated`
- `price.updated`
- `product.updated`
- `product.deactivated`

## Текущ обхват на теста

В текущия етап моля да се тестват само следните полета:

- `sku`
- `data.stockQty`
- `data.priceRetail`
- `data.priceWholesale`
- `data.priceGroup1`
- `data.catalog3`
- `data.state`

## Съпоставка на полетата

- `sku` -> `products.sku`
- `data.stockQty` -> `products.stockQty`
- `data.stockQty > 0` -> `stockStatus = instock`
- `data.stockQty <= 0` -> `stockStatus = outofstock`
- `data.priceRetail` -> `products.priceRetail`
- `data.priceWholesale` -> `products.priceWholesale`
- `data.priceGroup1` -> `products.priceGroup1`
- `data.catalog3` -> `products.manufacturerCode`
- `data.state = "Стоката не се използва"` -> `products.published = false`
- `data.state = "Стоката се използва"` -> `products.published = true`
- `data.state = "Стоката се използва често"` -> `products.published = true`

При `product.deactivated`:

- `published = false`
- `stockQty = 0`
- `stockStatus = outofstock`

## Значение на цените

Цените се подават така:

- `priceRetail` = Цена на дребно
- `priceWholesale` = Цена на едро
- `priceGroup1` = Цена за Ценова група 1

## Примерни заявки

### 1. Update само на наличност

```json
{
  "event": "stock.updated",
  "timestamp": "2026-04-03T09:00:00Z",
  "sku": "162AR81",
  "data": {
    "stockQty": 11
  }
}
```

### 2. Update само на трите цени

```json
{
  "event": "price.updated",
  "timestamp": "2026-04-03T09:05:00Z",
  "sku": "162AR81",
  "data": {
    "priceRetail": 10.0,
    "priceWholesale": 9.0,
    "priceGroup1": 7.5
  }
}
```

### 3. Product update с цени, производител и активен продукт

```json
{
  "event": "product.updated",
  "timestamp": "2026-04-03T09:10:00Z",
  "sku": "162AR81",
  "data": {
    "stockQty": 4,
    "priceRetail": 10.0,
    "priceWholesale": 9.0,
    "priceGroup1": 7.5,
    "catalog3": "ORIGINAL",
    "state": "Стоката се използва"
  }
}
```

### 4. Product update със статус „Стоката се използва често“

```json
{
  "event": "product.updated",
  "timestamp": "2026-04-03T09:15:00Z",
  "sku": "162AR81",
  "data": {
    "stockQty": 6,
    "priceRetail": 10.0,
    "priceWholesale": 9.0,
    "priceGroup1": 7.5,
    "catalog3": "OEM",
    "state": "Стоката се използва често"
  }
}
```

### 5. Product update със статус „Стоката не се използва“

```json
{
  "event": "product.updated",
  "timestamp": "2026-04-03T09:20:00Z",
  "sku": "162AR81",
  "data": {
    "stockQty": 0,
    "priceRetail": 10.0,
    "priceWholesale": 9.0,
    "priceGroup1": 7.5,
    "catalog3": "ORIGINAL",
    "state": "Стоката не се използва"
  }
}
```

### 6. Деактивиране на продукт

```json
{
  "event": "product.deactivated",
  "timestamp": "2026-04-03T09:25:00Z",
  "sku": "162AR81"
}
```

## Препоръчителен ред на тестовете

Препоръчителен ред на тестовете:

1. `stock.updated`
2. `price.updated`
3. `product.updated` с `catalog3` и `state = "Стоката се използва"`
4. `product.updated` с `state = "Стоката се използва често"`
5. `product.updated` с `state = "Стоката не се използва"`
6. `product.deactivated`

## Успешен отговор

```json
{
  "event": "product.updated",
  "message": "Webhook processed successfully.",
  "productId": "67d9a6...",
  "sku": "162AR81",
  "timestamp": "2026-04-03T09:10:00Z",
  "updatedFields": [
    "priceRetail",
    "priceWholesale",
    "priceGroup1",
    "stockQty",
    "stockStatus",
    "manufacturerCode",
    "published"
  ]
}
```

## Грешки

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
  "sku": "162AR81"
}
```
