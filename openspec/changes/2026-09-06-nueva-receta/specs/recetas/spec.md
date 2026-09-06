# Spec: recetas

## Purpose

Create recipes with a photo in Esencial: image upload to R2 (bucket `esencial-photos`, binding `PHOTOS`), authenticated photo serving, recipe creation with `photo_path`, and create page `/recetario/nueva` (RecipeEditor modal becomes edit-only).

## Requirements

### Requirement: UPLOAD — Subida de imagen a R2

`POST /api/uploads` MUST accept one multipart field `file` with content type `image/png`, `image/jpeg` or `image/webp` and size ≤ 5 MB. On success it MUST store bytes in R2 bucket `esencial-photos` (binding `PHOTOS`) under flat key `recipe-<uuid>.<ext>` and return `200` with `{ photo_path }` equal to that key. On failure it MUST fail closed with `{ error, field }`: missing file, disallowed type or malformed multipart → `400`; size > 5 MB → `413`; nothing persisted (no R2 object, no recipe).

#### Scenario: Upload happy path

- GIVEN a valid png/jpeg/webp file ≤ 5 MB
- WHEN `POST /api/uploads` sent with multipart field `file`
- THEN `200 { photo_path }` = `recipe-<uuid>.<ext>` AND object stored in R2

#### Scenario: Missing file field

- GIVEN multipart request without `file`
- WHEN `POST /api/uploads` sent
- THEN `400 { error, field }` AND no R2 object stored

#### Scenario: Disallowed content type

- GIVEN a file of type `image/gif`
- WHEN `POST /api/uploads` sent
- THEN `400 { error, field }` AND no R2 object stored

#### Scenario: Oversize file

- GIVEN a valid-type file larger than 5 MB
- WHEN `POST /api/uploads` sent
- THEN `413 { error, field }` AND no R2 object stored

#### Scenario: Malformed multipart

- GIVEN an unparseable multipart body
- WHEN `POST /api/uploads` sent
- THEN `400 { error, field }` AND no R2 object stored

### Requirement: PHOTO — Servicio de la foto

`GET /api/uploads/:key` MUST be served behind the authenticated API guard, returning the stored object with `Cache-Control: immutable`. An unknown key MUST return `404` with envelope `{ error, field }`.

#### Scenario: Authenticated fetch

- GIVEN authenticated user and existing object at key `recipe-<uuid>.png`
- WHEN `GET /api/uploads/recipe-<uuid>.png` requested
- THEN image bytes returned with `Cache-Control: immutable`

#### Scenario: Unauthenticated fetch

- GIVEN request without valid session
- WHEN `GET /api/uploads/recipe-<uuid>.png` requested
- THEN auth guard rejects (401) AND no bytes returned

#### Scenario: Unknown key

- GIVEN a key with no object in R2
- WHEN `GET /api/uploads/<unknown-key>` requested
- THEN `404 { error, field }`

### Requirement: RECIPE_CREATE — Crear receta con foto

`POST /api/recipes` MUST persist a recipe carrying a `photo_path` returned by the upload endpoint, and `/recetario` MUST render that photo. A `photo_path` not returned by an upload MUST be rejected with `400 { error, field }` and no recipe persisted (fail closed).

#### Scenario: Create with photo

- GIVEN authenticated user with `photo_path` from a successful upload
- WHEN creating a recipe with name, ingredients and that `photo_path`
- THEN recipe persisted with `photo_path` AND photo renders in `/recetario`

#### Scenario: Invalid photo_path

- GIVEN `photo_path` not returned by any upload
- WHEN creating a recipe with that `photo_path`
- THEN `400 { error, field }` AND no recipe persisted

### Requirement: PAGE — Página /recetario/nueva

The system MUST provide a dedicated create page at `/recetario/nueva` with a full form (name, ingredients, steps, materials, tags, photo upload), reachable from `/recetario` via a "Nueva receta" action. Submitting the form MUST upload the photo (if any), then create the recipe and navigate to the result. The RecipeEditor modal MUST remain edit-only and MUST NOT create recipes.

#### Scenario: Navigate from recetario

- GIVEN authenticated user on `/recetario`
- WHEN activating the "Nueva receta" action
- THEN user lands on `/recetario/nueva` with full form visible

#### Scenario: Create from page

- GIVEN form on `/recetario/nueva` filled with name, ingredients, steps, materials, tags and selected photo
- WHEN submitting
- THEN photo uploaded, recipe created with returned `photo_path`, and user navigates to new recipe showing the photo

#### Scenario: Modal edit-only

- GIVEN existing recipe in `/recetario`
- WHEN opening the RecipeEditor for that recipe
- THEN it edits the existing recipe only AND provides no create path
