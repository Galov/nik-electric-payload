# Спецификация на webhook-а от Microinvest v3

Този документ описва текущия формат на webhook-а към сайта на Ник Електрик.

## Адрес

`POST /api/integrations/microinvest/webhook`

Текущ тестов адрес:

`http://65.21.176.78:3000/api/integrations/microinvest/webhook`

## Достъп

Задължителен header:

`x-microinvest-secret: test-microinvest-secret`

## Формат на заявката

Тялото на заявката трябва винаги да е JSON масив.

Дори когато се изпраща само 1 продукт, той трябва да бъде подаден като масив с 1 елемент.

## Ключ за разпознаване на продукта

Продуктите се разпознават по:

1. `id` от Microinvest
2. `sku`, ако продуктът още няма записан `id` от Microinvest в сайта

Ако продуктът бъде намерен по `sku` и има подадено `id`, сайтът ще запише това `id` към продукта за следващи синхронизации.

## Поддържани събития

- `stock.updated`
- `price.updated`
- `product.updated`
- `product.deactivated`

## Текущ обхват на теста

В текущия етап моля да се тестват само следните полета:

- `id`
- `sku`
- `data.stockQty`
- `data.priceRetail`
- `data.priceWholesale`
- `data.priceGroup1`
- `data.catalog3`
- `data.state`
- `data.description`

## Съпоставка на полетата

- `id` -> `products.miProductId`
- `sku` -> `products.sku`
- `data.stockQty` -> `products.stockQty`
- `data.stockQty > 0` -> `stockStatus = instock`
- `data.stockQty <= 0` -> `stockStatus = outofstock`
- `data.priceRetail` -> `products.priceRetail`
- `data.priceWholesale` -> `products.priceWholesale`
- `data.priceGroup1` -> `products.priceGroup1`
- `data.catalog3` -> `products.manufacturerCode`
- `data.description` -> source за:
  - `products.originalSku`
  - `products.productType`
  - `products.isRefurbished`
- `data.state = "Стоката не се използва"` -> `products.published = false`
- `data.state = "Стоката се използва"` -> `products.published = true`
- `data.state = "Стоката се използва често"` -> `products.published = true`

При `product.deactivated`:

- `published = false`
- `stockQty = 0`
- `stockStatus = outofstock`

## Логика за типа на продукта от `data.description`

- ако стойността завършва на `R` -> продуктът се третира като `От нов уред`
- ако стойността завършва на `OR` -> продуктът се третира като `Оригинал`
- ако няма suffix -> продуктът се третира като съвместим

## Значение на цените

- `priceRetail` = Цена на дребно
- `priceWholesale` = Цена на едро
- `priceGroup1` = Цена за Ценова група 1

## Примерни заявки

### 1. Update само на наличност за 1 продукт

```json
[
  {
    "event": "stock.updated",
    "timestamp": "2026-04-06T13:00:00Z",
    "id": 501,
    "sku": "162AR81",
    "data": {
      "stockQty": 11
    }
  }
]
```

### 2. Update само на трите цени за 1 продукт

```json
[
  {
    "event": "price.updated",
    "timestamp": "2026-04-06T13:05:00Z",
    "id": 501,
    "sku": "162AR81",
    "data": {
      "priceRetail": 10.0,
      "priceWholesale": 9.0,
      "priceGroup1": 7.5
    }
  }
]
```

### 3. Product update с описание, производител и статус

```json
[
  {
    "event": "product.updated",
    "timestamp": "2026-04-06T13:10:00Z",
    "id": 501,
    "sku": "162AR81",
    "data": {
      "stockQty": 4,
      "priceRetail": 10.0,
      "priceWholesale": 9.0,
      "priceGroup1": 7.5,
      "catalog3": "ORIGINAL",
      "description": "C00861866R",
      "state": "Стоката се използва"
    }
  }
]
```

### 4. Update на повече от един продукт в една заявка

```json
[
  {
    "event": "product.updated",
    "timestamp": "2026-04-06T13:15:00Z",
    "id": 501,
    "sku": "162AR81",
    "data": {
      "stockQty": 4,
      "priceRetail": 10.0,
      "priceWholesale": 9.0,
      "priceGroup1": 7.5,
      "catalog3": "ORIGINAL",
      "description": "C00861866OR",
      "state": "Стоката се използва"
    }
  },
  {
    "event": "stock.updated",
    "timestamp": "2026-04-06T13:16:00Z",
    "id": 502,
    "sku": "162AR82",
    "data": {
      "stockQty": 0
    }
  }
]
```

### 5. Деактивиране на продукт

```json
[
  {
    "event": "product.deactivated",
    "timestamp": "2026-04-06T13:20:00Z",
    "id": 501,
    "sku": "162AR81"
  }
]
```

## Успешен отговор

```json
{
  "message": "Webhook processed successfully.",
  "processed": 2,
  "results": [
    {
      "event": "product.updated",
      "index": 0,
      "message": "Webhook processed successfully.",
      "productId": "67d9a6...",
      "miProductId": 501,
      "sku": "162AR81",
      "status": 200,
      "timestamp": "2026-04-06T13:15:00Z",
      "updatedFields": [
        "priceRetail",
        "priceWholesale",
        "priceGroup1",
        "stockQty",
        "stockStatus",
        "manufacturerCode",
        "originalSku",
        "productType",
        "isRefurbished",
        "published"
      ]
    },
    {
      "event": "stock.updated",
      "index": 1,
      "message": "Webhook processed successfully.",
      "productId": "67d9a7...",
      "miProductId": 502,
      "sku": "162AR82",
      "status": 200,
      "timestamp": "2026-04-06T13:16:00Z",
      "updatedFields": ["stockQty", "stockStatus"]
    }
  ]
}
```

## Частичен отговор при смесен резултат

Ако част от продуктите бъдат обработени успешно, а част не бъдат намерени или имат невалидни данни, endpoint-ът връща:

- HTTP статус `207`
- масив с резултат за всеки елемент

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
  "error": "Request body must be a JSON array."
}
```

или

```json
{
  "error": "Request body must contain at least one item."
}
```

### 207 Multi-Status

```json
{
  "message": "Webhook processed with item-level errors.",
  "processed": 2,
  "results": [
    {
      "event": "product.updated",
      "index": 0,
      "message": "Webhook processed successfully.",
      "productId": "67d9a6...",
      "miProductId": 501,
      "sku": "162AR81",
      "status": 200
    },
    {
      "event": "product.updated",
      "index": 1,
      "message": "Product not found.",
      "miProductId": 999999,
      "sku": "sku0000000001",
      "status": 404
    }
  ]
}
```
