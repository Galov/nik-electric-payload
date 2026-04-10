# Спецификация на webhook-а от Microinvest v4

Този документ описва новия договор за webhook-а към сайта на Ник Електрик.

## Адрес

`POST /api/integrations/microinvest/webhook`

Текущ тестов адрес:

`https://nikelectric.eu/api/integrations/microinvest/webhook`

## Достъп

Задължителен header:

`x-microinvest-secret: <shared secret>`

## Формат на заявката

Тялото на заявката трябва винаги да е JSON обект:

```json
{
  "event": "product.updated",
  "items": []
}
```

`items` винаги е масив, дори когато има само 1 продукт.

## Поддържани събития

- `product.created`
- `product.updated`
- `product.deleted`

## Ключ за разпознаване на продукта

Продуктите се разпознават по:

1. `id` от Microinvest
2. `sku`, ако продуктът още няма записан `id` от Microinvest в сайта

Ако продуктът бъде намерен по `sku` и има подадено `id`, сайтът ще запише това `id` в `miProductId` за следващи синхронизации.

## Логика по събития

### `product.created`

- ако продуктът не съществува -> създава се
- ако продуктът вече съществува -> връща контролиран `409 Product already exists`

### `product.updated`

- ако продуктът съществува -> обновява само подадените полета
- ако продуктът не съществува -> връща `404 Product not found`

### `product.deleted`

- ако продуктът съществува -> изтрива го
- ако продуктът не съществува -> връща `404 Product not found`

## Поддържани полета в `data`

- `title`
- `description`
- `shortDescription`
- `originalSku`
- `manufacturerCode`
- `catalog3`
- `priceRetail`
- `priceWholesale`
- `priceGroup1`
- `stockQty`
- `published`
- `state`

## Съпоставка на полетата

- `id` -> `products.miProductId`
- `sku` -> `products.sku`
- `data.title` -> `products.title`
- `data.description` -> `products.description`
- `data.shortDescription` -> `products.shortDescription`
- `data.originalSku` -> `products.originalSku`
- `data.manufacturerCode` -> `products.manufacturerCode`
- `data.catalog3` -> `products.manufacturerCode`
- `data.priceRetail` -> `products.priceRetail`
- `data.priceWholesale` -> `products.priceWholesale`
- `data.priceGroup1` -> `products.priceGroup1`
- `data.stockQty` -> `products.stockQty`
- `data.stockQty > 0` -> `stockStatus = instock`
- `data.stockQty <= 0` -> `stockStatus = outofstock`
- `data.description` -> source за:
  - `products.originalSku`
  - `products.productType`
  - `products.isRefurbished`
- `data.state = "Стоката не се използва"` -> `products.published = false`
- `data.state = "Стоката се използва"` -> `products.published = true`
- `data.state = "Стоката се използва често"` -> `products.published = true`
- `data.published` -> `products.published`

## Логика за типа на продукта от `data.description`

- ако стойността завършва на `R` -> продуктът се третира като `От нов уред`
- ако стойността завършва на `OR` -> продуктът се третира като `Оригинал`
- ако няма suffix -> продуктът се третира като съвместим

## Значение на цените

- `priceRetail` = Цена на дребно
- `priceWholesale` = Цена на едро
- `priceGroup1` = Цена за Ценова група 1

## Примерни заявки

### 1. Създаване на нов продукт

```json
{
  "event": "product.created",
  "items": [
    {
      "id": 601,
      "sku": "NEW001",
      "timestamp": "2026-04-10T09:00:00Z",
      "data": {
        "title": "Нов продукт",
        "description": "C00861866R",
        "shortDescription": "Кратко описание",
        "catalog3": "OEM",
        "priceRetail": 10,
        "priceWholesale": 9,
        "priceGroup1": 7.5,
        "stockQty": 4,
        "published": true
      }
    }
  ]
}
```

### 2. Обновяване само на цена и наличност

```json
{
  "event": "product.updated",
  "items": [
    {
      "id": 501,
      "sku": "162AR81",
      "timestamp": "2026-04-10T09:05:00Z",
      "data": {
        "priceRetail": 10,
        "priceWholesale": 9,
        "priceGroup1": 7.5,
        "stockQty": 4
      }
    }
  ]
}
```

### 3. Скриване или повторно публикуване на продукт

```json
{
  "event": "product.updated",
  "items": [
    {
      "id": 501,
      "sku": "162AR81",
      "timestamp": "2026-04-10T09:10:00Z",
      "data": {
        "published": false
      }
    }
  ]
}
```

### 4. Изтриване на продукт

```json
{
  "event": "product.deleted",
  "items": [
    {
      "id": 501,
      "sku": "162AR81",
      "timestamp": "2026-04-10T09:15:00Z"
    }
  ]
}
```

### 5. Batch update на повече от един продукт

```json
{
  "event": "product.updated",
  "items": [
    {
      "id": 501,
      "sku": "162AR81",
      "data": {
        "stockQty": 4,
        "priceRetail": 10
      }
    },
    {
      "id": 502,
      "sku": "162AR82",
      "data": {
        "published": false
      }
    }
  ]
}
```

## Успешен отговор

```json
{
  "message": "Webhook processed successfully.",
  "processed": 1,
  "results": [
    {
      "event": "product.updated",
      "index": 0,
      "message": "Webhook processed successfully.",
      "productId": "67d9a6...",
      "miProductId": 501,
      "sku": "162AR81",
      "status": 200,
      "timestamp": "2026-04-10T09:05:00Z",
      "updatedFields": ["priceRetail", "priceWholesale", "priceGroup1", "stockQty", "stockStatus"]
    }
  ]
}
```

## Частичен отговор при смесен резултат

Ако част от продуктите бъдат обработени успешно, а част върнат грешка, endpoint-ът връща:

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
  "error": "Request body must be a JSON object with event and items[]."
}
```

или

```json
{
  "error": "Request body must contain at least one item."
}
```

### 404 Product not found

```json
{
  "message": "Webhook processed with item-level errors.",
  "processed": 1,
  "results": [
    {
      "event": "product.updated",
      "index": 0,
      "message": "Product not found.",
      "miProductId": 999999,
      "sku": "sku0000000001",
      "status": 404
    }
  ]
}
```

### 409 Product already exists

```json
{
  "message": "Webhook processed with item-level errors.",
  "processed": 1,
  "results": [
    {
      "event": "product.created",
      "index": 0,
      "message": "Product already exists.",
      "productId": "67d9a6...",
      "miProductId": 501,
      "sku": "162AR81",
      "status": 409
    }
  ]
}
```
