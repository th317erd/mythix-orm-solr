'use strict';

const Nife                  = require('nife');
const { DateTime }          = require('luxon');

const {
  Literals,
  ConnectionBase,
} = require('mythix-orm');

const SOLRQueryGenerator    = require('./solr-query-generator');
const { HTTPClient }        = require('./http-client');

/// Mythix ORM connection driver for SOLR.
///
/// Extends: [ConnectionBase](https://github.com/th317erd/mythix-orm/wiki/ConnectionBase)
class SOLRConnection extends ConnectionBase {
  static dialect = 'solr';

  static DefaultQueryGenerator = SOLRQueryGenerator;

  /// Create a new `SOLRConnection` instance.
  ///
  /// Arguments:
  ///   options?: object
  ///     Options to provide to the connection. All options are optional, though `models`
  ///     is required before the connection is used. If not provided here to the constructor,
  ///     the application models can always be provided at a later time using the
  ///     [Connection.registerModels](https://github.com/th317erd/mythix-orm/wiki/ConnectionBase#method-registerModels) method.
  ///     | Option | Type | Default Value | Description |
  ///     | ------ | ---- | ------------- | ----------- |
  ///     | `bindModels` | `boolean` | `true` | Bind the models provided to this connection (see the Mythix ORM [Connection Binding](https://github.com/th317erd/mythix-orm/wiki/ConnectionBinding) article for more information). |
  ///     | `logger` | Logger Interface | `undefined` | Assign a logger to the connection. If a logger is assigned, then every query (and every error) will be logged using this logger. |
  ///     | `models` | `Array<Model>` | `undefined` | Models to register with the connection (these models will be bound to the connection if the `boundModels` option is `true`).
  ///     | `queryGenerator` | [QueryGenerator](https://github.com/th317erd/mythix-orm/wiki/QueryGeneratorBase) | <see>SOLRQueryGenerator</see> | Provide an alternate `QueryGenerator` interface for generating Lucene statements for SOLR. This is not usually needed, as the `SOLRConnection` itself will provide its own generator interface. However, if you want to customize the default query generator, or want to provide your own, you can do so using this option. |
  constructor(_options) {
    super(_options);

    if (!(_options && _options.queryGenerator))
      this.setQueryGenerator(new SOLRQueryGenerator(this));

    Object.defineProperties(this, {
      'httpClient': {
        writable:     true,
        enumerable:   false,
        configurable: true,
        value:        null,
      },
    });
  }

  /// Check to see if `start` has already been called
  /// on this connection. This is used to know if a
  /// connection is "active" or not.
  ///
  /// Return: boolean
  isStarted() {
    return !!this.httpClient;
  }

  async start() {
    this.httpClient = new HTTPClient();
  }

  async stop() {
    this.httpClient = null;
  }

  /// Drop a table/bucket from the database.
  ///
  /// This uses the provided `Model` class to
  /// find the table/bucket name to drop, and then
  /// will drop it from the underlying database.
  ///
  /// The `options` argument is database specific,
  /// but might contain options such as `ifExists`,
  /// or `cascade`, for example.
  ///
  /// Return: any
  ///   A database specific return value for the drop table
  ///   operation.
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model to drop from the database. The method <see name="Model.getTableName">Model.static getTableName</see>
  ///     is called on the model class to figure out what table/bucket to
  ///     drop from the database.
  ///   options?: object
  ///     Database specific operations for dropping the table/bucket. Please
  ///     refer to the documentation of the driver you are using for further
  ///     information.
  // eslint-disable-next-line no-unused-vars
  async dropTable(Model, options) {
    throw new Error(`${this.constructor.name}::dropTable: This operation is not supported for this connection type.`);
  }

  /// Drop all specified tables/buckets from the database.
  ///
  /// This uses the provided `Models` classes to
  /// find the table/bucket names to drop, and then
  /// will drop all of them from the underlying database.
  ///
  /// The `options` argument is database specific,
  /// but might contain options such as `ifExists`,
  /// or `cascade`, for example.
  ///
  /// The model classes provided are first sorted in
  /// "creation order" using the <see>Utils.sortModelNamesByCreationOrder</see>
  /// method, and then the tables/buckets are dropped in the
  /// reverse order. This is to ensure that any foreign key
  /// constraints in play will play nicely with the operation
  /// and not throw errors.
  ///
  /// This method simply calls <see>ConnectionBase.dropTable</see> for every
  /// model provided--after sorting the models based on their
  /// foreign keys.
  ///
  /// Return: any
  ///   A database specific return value for the drop tables
  ///   operation.
  ///
  /// Arguments:
  ///   Models: Array<class <see>Model</see>>
  ///     All the models to drop from the database. The method <see name="Model.getTableName">Model.static getTableName</see>
  ///     is called on each model class to figure out what table/bucket to
  ///     drop from the database.
  ///   options?: object
  ///     Database specific operations for dropping the table/bucket. Please
  ///     refer to the documentation of the driver you are using for further
  ///     information.
  async dropTables(_Models, options) {
    if (!_Models)
      return;

    // First we collect all models and put them into a map
    let modelMap = _Models;

    if (Nife.instanceOf(_Models, 'array', 'function')) {
      modelMap = {};

      let Models = Nife.toArray(_Models).filter(Boolean);
      for (let i = 0, il = Models.length; i < il; i++) {
        let Model     = Models[i];
        let modelName = Model.getModelName();

        modelMap[modelName] = Model;
      }
    }

    // Second we sort the model names in creation order,
    // and going in reverse of that order we destroy
    // each table.
    let modelNames        = Object.keys(modelMap);
    let sortedModelNames  = Utils.sortModelNamesByCreationOrder(this, modelNames);
    let results           = [];

    for (let i = sortedModelNames.length - 1; i >= 0; i--) {
      let modelName = sortedModelNames[i];
      let Model     = modelMap[modelName];

      results.push(await this.dropTable(Model, options));
    }

    return results;
  }

  /// Create a table/bucket using the provided model class.
  ///
  /// The provided `options` are database specific,
  /// but might contain things like `ifNotExists`, for
  /// example.
  ///
  /// Return: any
  ///   A connection specific return value for the operation.
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model class used to create the table/bucket. The <see name="Model.getTableName">Model.static getTableName</see>
  ///     method will be called to get the table/bucket name to create. Then
  ///     the `static fields` property on the model class is used to create the
  ///     columns/fields for the table/bucket. Only "concrete" fields are created
  ///     in the underlying database. Any "virtual" or "relational" fields will
  ///     be skipped.
  ///   options?: object
  ///     Database specific operations for creating the table/bucket. Please
  ///     refer to the documentation of the driver you are using for further
  ///     information.
  async createTable(Model, options) {
    throw new Error(`${this.constructor.name}::createTable: This operation is not supported for this connection type.`);
  }

  /// Create all specified tables/buckets in the database.
  ///
  /// This uses the provided `Models` classes to
  /// create the tables/buckets specified.
  ///
  /// The `options` argument is database specific,
  /// but might contain options such as `ifNotExists`,
  /// for example.
  ///
  /// The model classes provided are first sorted in
  /// "creation order" using the <see>Utils.sortModelNamesByCreationOrder</see>
  /// method, and then the tables/buckets are created in the
  /// that order. This is to ensure that any foreign key
  /// constraints in play will play nicely with the operation
  /// and not throw errors.
  ///
  /// This method simply calls <see>ConnectionBase.createTable</see> for every
  /// model provided--after sorting the models based on their
  /// foreign keys.
  ///
  /// Return: any
  ///   A database specific return value for the create tables
  ///   operation.
  ///
  /// Arguments:
  ///   Models: Array<class <see>Model</see>>
  ///     The model classes used to create the tables/buckets. The <see name="Model.getTableName">Model.static getTableName</see>
  ///     method will be called for each model to get the table/bucket name to create. Then
  ///     the `static fields` property on each model class is used to create the
  ///     columns/fields for the table/bucket. Only "concrete" fields are created
  ///     in the underlying database. Any "virtual" or "relational" fields will
  ///     be skipped.
  ///   options?: object
  ///     Database specific operations for dropping the table/bucket. Please
  ///     refer to the documentation of the driver you are using for further
  ///     information.
  async createTables(_Models, options) {
    if (!_Models)
      return;

    // First we collect all models and put them into a map
    let modelMap = _Models;

    if (Nife.instanceOf(_Models, 'array', 'function')) {
      modelMap = {};

      let Models = Nife.toArray(_Models).filter(Boolean);
      for (let i = 0, il = Models.length; i < il; i++) {
        let Model     = Models[i];
        let modelName = Model.getModelName();

        modelMap[modelName] = Model;
      }
    }

    // Second we sort the model names in creation order,
    // and then create the tables in that order
    let modelNames        = Object.keys(modelMap);
    let sortedModelNames  = Utils.sortModelNamesByCreationOrder(this, modelNames);
    let results           = [];

    for (let i = 0, il = sortedModelNames.length; i < il; i++) {
      let modelName = sortedModelNames[i];
      let Model     = modelMap[modelName];

      results.push(await this.createTable(Model, options));
    }

    return results;
  }

  // Define operations

  async defineTable() {
    throw new Error(`${this.constructor.name}::defineTable: This operation is not supported for this connection type.`);
  }

  async defineConstraints() {
    throw new Error(`${this.constructor.name}::defineConstraints: This operation is not supported for this connection type.`);
  }

  async defineIndexes() {
    throw new Error(`${this.constructor.name}::defineIndexes: This operation is not supported for this connection type.`);
  }

  // Alter operations

  /// Alter a table/bucket based on the provided attributes for
  /// the model.
  ///
  /// For SQL based drivers this might run a statement like the following
  /// `ALTER TABLE "users" RENAME TO "old_users";`
  ///
  /// Please refer to the documentation of the database driver
  /// you are using for more information.
  ///
  /// Return: Promise<void>
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model to alter. This is used to alter the underlying
  ///     table/bucket in the database.
  ///   newAttributes: object
  ///     The attributes to alter. Please refer to the documentation
  ///     of the database driver you are using for more information.
  async alterTable(Model, newModelAttributes, options) {
    throw new Error(`${this.constructor.name}::renameTable: This operation is not supported for this connection type.`);
  }

  /// Drop the specified column/field from the database.
  ///
  /// The table/bucket to drop the field from is known
  /// by the `Model` property (model class) on the field
  /// itself.
  ///
  /// The provided `options` are specific to the database
  /// you are using.
  /// Please refer to the documentation of the database driver
  /// you are using for more information.
  ///
  /// Return: any
  ///   A database specific return value for the operation completed.
  ///
  /// Arguments:
  ///   Field: <see>Field</see>
  ///     The column/field to drop from the database.
  /// options?: object
  ///   Database specific option for the operation. Please refer to the
  ///   documentation of the database driver you are using for more information.
  async dropColumn(Field, options) {
    throw new Error(`${this.constructor.name}::dropColumn: This operation is not supported for this connection type.`);
  }

  /// Alter the specified column/field in the database.
  ///
  /// This will take the two fields, `Field` and `NewField`,
  /// and will compare them. It will generate multiple alter
  /// table statements internally, and will alter the column/field
  /// based on the differences it detects between the two fields.
  ///
  /// If `NewField` is provided as a raw object, then it will be
  /// converted into a <see>Field</see>.
  ///
  /// This method will check for the following differences between
  /// the two fields, in this order:
  /// 1. `allowNull`
  /// 2. `type`
  /// 3. `defaultValue`
  /// 4. `primaryKey`
  /// 5. `unique`
  /// 6. `index` (will calculate index differences, and do the minimum work required)
  /// 7. `columnName`
  ///
  /// Return: Promise<void>
  ///
  /// Arguments:
  ///   Field: <see>Field</see>
  ///     The current column/field (as it is in the database) that we are changing.
  ///   NewField: <see>Field</see> | object
  ///     The new field properties to compare. Only the provided properties will be compared.
  ///     For example, if you only supply a `defaultValue` property, then only that will be
  ///     altered (if it differs from `Field`).
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  async alterColumn(Field, newFieldAttributes, options) {
    throw new Error(`${this.constructor.name}::alterColumn: This operation is not supported for this connection type.`);
  }

  /// Add the column/field specified to the database.
  ///
  /// The table/bucket to add the field to is fetched from the
  /// `Model` property on the supplied field.
  ///
  /// Return: Promise<void>
  ///
  /// Arguments:
  ///   Field: <see>Field</see>
  ///     The new field to add to the underlying database.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  async addColumn(Field, options) {
    throw new Error(`${this.constructor.name}::addColumn: This operation is not supported for this connection type.`);
  }

  /// Create an index (or combo index) in the database.
  ///
  /// This will create a new index for the field(s) specified.
  /// The `indexFields` argument must be an array of field names
  /// as strings. It can contain more than one field. If it does
  /// contain more than one field, then a combo index will be created
  /// for all specified fields (if the database you are using supports
  /// combined indexes).
  ///
  /// All the provided field names must exist on the provided `Model`.
  /// If they don't, then an exception will be thrown. The field names
  /// can be fully qualified, but they don't need to be. If they are
  /// fully qualified, then they must all still be owned by the provided
  /// `Model`. You can not for example use a fully qualified field name
  /// from another model.
  ///
  /// Combo indexes are created by combining two or more fields to create
  /// the index. For example, you could create a combo index for Users
  /// like `[ 'firstName', 'lastName', 'email' ]` if it is common for your
  /// application to query on all three of these fields at once.
  ///
  /// If you just want to index a single column/field, simply provide only
  /// one field name, i.e. `[ 'firstName' ]`.
  ///
  /// Return: Promise<void>
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model that owns the specified fields.
  ///   indexFields: Array<string>
  ///     The field names to use to create the index. One field name
  ///     is valid if you only wish to index a single field. These are
  ///     used to generate the index name, along with which fields to
  ///     index.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  async addIndex(Model, indexFields, options) {
    throw new Error(`${this.constructor.name}::addIndex: This operation is not supported for this connection type.`);
  }

  /// Drop the index from the database based on the specified fields.
  ///
  /// This is the exact inverse of <see>ConnectionBase.addIndex</see>,
  /// and it functions nearly identically, except that it will drop
  /// the specified index instead of creating it.
  ///
  /// Return: Promise<void>
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model that owns the specified fields.
  ///   indexFields: Array<string>
  ///     The field names to used to drop the index. These are used
  ///     to generate the index name, which will then be dropped.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  async dropIndex(Model, indexFields, options) {
    throw new Error(`${this.constructor.name}::addIndex: This operation is not supported for this connection type.`);
  }

  /// Insert the specified models into the specified
  /// table/bucket (based on the provided `Model`).
  ///
  /// This will insert one or more models into the database.
  /// Like nearly all such Mythix ORM methods, bulk operations are supported
  /// out-of-the-box. You can provide a single model to `models`,
  /// or you can provide an array of models.
  ///
  /// The provided "models" can be either an object, an array of
  /// objects, a model instance, or an array of model instances,
  /// or a mix of both. Mythix ORM will ensure any provided raw
  /// objects are first converted into model instances using the
  /// provided `Model` before it inserts anything.
  ///
  /// You can also supply "sub models", and those will also be
  /// inserted in the correct order (and any foreign keys will
  /// also be updated for you). For example, if you have a `User`
  /// model that has a virtual `Type.Model` `primaryRole` field,
  /// then you can supply a new `Role` model upon insertion and
  /// Mythix ORM will handle this properly for you. For example:
  /// `await connection.insert(User, new User({ primaryRole: new Role({ ... }) }))`.
  /// This type of sub model save also works on through-tables.
  /// If `primaryRole` was targeting a `Role` model, but through
  /// another table(s), then Mythix ORM will also create the through-table
  /// relationships (if it is able to).
  ///
  /// This **will not work** for `Types.Models` (multi-relations).
  /// Mythix ORM doesn't know what you intend for multi-relations
  /// (overwrite the set? add to the set? what?) so it will deliberately
  /// skip multi-relational fields. "sub models on insert" only work for
  /// single-relation fields defined with `Types.Model`. For multi-relation
  /// fields you must manually work through the relation yourself. For example,
  /// if our user instead had a `Types.Models` `roles` field (plural), then you
  /// would instead need to:
  ///
  /// Example:
  ///   let user = await connection.insert(User, new User({ ... }));
  ///   let role = await connection.insert(Role, { ... }); // model instance is not required
  ///   await user.addToRoles(role);
  ///
  ///
  /// Return: Promise<Array<Model> | Model>
  ///   If you provide an array of models, then an array of models will be
  ///   returned. If you provide only a single model, then a single
  ///   model will be returned. If you provided "sub models" then those
  ///   will be returned as "related models" on the primary model. For example,
  ///   using the above `User` example, the newly created `Role` model that was
  ///   stored for the `primaryRole` would be available on the returned `User`
  ///   model as `user.Roles[0]`, or you could also access it via the field you
  ///   set it on `user.primaryRole`.
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model class used for the operation. This defines what
  ///     table/bucket to insert the specified models into.
  ///   models: Array<Model | object> | object | <see>Model</see>
  ///     The model(s) to insert into the database. If raw objects are provided,
  ///     then the properties of each object must match the required attributes
  ///     for the model class.
  ///   options?: object
  ///     Most of these options are database/driver specific. However, the following
  ///     options are common across all database drivers:
  ///     | Option | Type | Default Value | Description |
  ///     | ------------- | ---- | ------------- | ----------- |
  ///     | `skipHooks` | `boolean` &#124; `object` | `undefined` | Skip specific hooks. See <see>ConnectionBase.runSaveHooks</see> for more information. |
  ///     | `batchSize` | `number` | `500` | The size of each batch during a multi-model insert operation. |
  // eslint-disable-next-line no-unused-vars
  async insert(Model, models, _options) {
    throw new Error(`${this.constructor.name}::insert: This operation is not supported for this connection type.`);
  }

  /// Insert or update (upsert) models into the database.
  ///
  /// This method is only supported by some databases. Database
  /// drivers that don't support `upsert` natively may attempt to emulate
  /// the operation (at the cost of speed).
  ///
  /// This method should function identically to <see>ConnectionBase.insert</see>,
  /// with the exception that it should update rows that already exist in the database
  /// instead of inserting new rows.
  ///
  /// See: ConnectionBase.insert
  ///
  /// Return: Promise<Array<Model> | Model>
  ///   If you provide an array of models, then an array of models will be
  ///   returned. If you provide only a single model, then a single
  ///   model will be returned. If you provided "sub models" then those
  ///   will be returned as "related models" on the primary model. For example,
  ///   using the above `User` example, the newly created `Role` model that was
  ///   stored for the `primaryRole` would be available on the returned `User`
  ///   model as `user.Roles[0]`, or you could also access it via the field you
  ///   set it on `user.primaryRole`.
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model class used for the operation. This defines what
  ///     table/bucket to insert the specified models into.
  ///   models: Array<Model | object> | object | <see>Model</see>
  ///     The model(s) to insert into the database. If raw objects are provided,
  ///     then the properties of each object must match the required attributes
  ///     for the model class.
  ///   options?: object
  ///     Most of these options are database/driver specific. However, the following
  ///     options are common across all database drivers:
  ///     | Option | Type | Default Value | Description |
  ///     | ------------- | ---- | ------------- | ----------- |
  ///     | `skipHooks` | `boolean` &#124; `object` | `undefined` | Skip specific hooks. See <see>ConnectionBase.runSaveHooks</see> for more information. |
  ///     | `batchSize` | `number` | `500` | The size of each batch during a multi-model upsert operation. |
  // eslint-disable-next-line no-unused-vars
  async upsert(Model, models, _options) {
    throw new Error(`${this.constructor.name}::upsert: This operation is not supported for this connection type.`);
  }

  /// Update the specified models in the database.
  ///
  /// Many databases don't have good (or even decent) support
  /// for bulk updates, so unfortunately this method is fairly
  /// slow, and will usually make a query to the database for each
  /// model updated.
  ///
  /// If you want to update many models at the same time (using the same
  /// attributes across all models), then consider using the <see>ConnectionBase.updateAll</see>
  /// method instead.
  ///
  /// Note:
  ///   Models will only be updated if they are dirty. Also, only the
  ///   dirty attributes for each model will be updated (some attributes
  ///   are always dirty, for example `updatedAt` fields are forced to
  ///   always be dirty based on the configuration of their `defaultValue`).
  ///
  /// Return: Promise<Array<Model> | Model>
  ///   If you provide an array of models, then an array of models will be
  ///   returned. If you provide only a single model, then a single
  ///   model will be returned.
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model class used for the operation. This defines what
  ///     table/bucket to update.
  ///   models: Array<Model | object> | object | <see>Model</see>
  ///     The model(s) to update in the database. If raw objects are provided,
  ///     then the properties of each object must match the required attributes
  ///     for the model class.
  ///   options?: object
  ///     Most of these options are database/driver specific. However, the following
  ///     options are common across all database drivers:
  ///     | Option | Type | Default Value | Description |
  ///     | ------------- | ---- | ------------- | ----------- |
  ///     | `skipHooks` | `boolean` &#124; `object` | `undefined` | Skip specific hooks. See <see>ConnectionBase.runSaveHooks</see> for more information. |
  ///     | `batchSize` | `number` | `500` | The size of each batch during a multi-model update operation. |
  // eslint-disable-next-line no-unused-vars
  async update(Model, models, _options) {
    throw new Error(`${this.constructor.name}::update: This operation is not supported for this connection type.`);
  }

  /// Update multiple models at the same time (bulk update).
  ///
  /// This will update multiple models at the same time
  /// using the provided `query` to select which models to update.
  /// All matching rows will set the provided `attributes` upon them.
  ///
  /// The provided `attributes` can be a model instance, or
  /// a raw object. If a raw object is provided, then they
  /// will be converted into a model instance using the provided
  /// `Model` class. This also means that you can *only* bulk update
  /// columns/fields that exist on the model itself (i.e. you might have
  /// other columns in your table not related to this model, and
  /// those can **not** be updated using this method).
  ///
  /// Note:
  ///   As always with Mythix ORM, you will **never** supply
  ///   raw column names as the `attributes`. You must always
  ///   provide model field names in Mythix ORM.
  ///
  /// Note:
  ///   This will be an update operation across all matching rows,
  ///   using the data provided. This method is really only useful
  ///   when you want to update multiple rows to the **same values**.
  ///   If you need to update each row to different values per-row,
  ///   then use the <see>ConnectionBase.update</see> method instead.
  ///
  /// Return: Promise<any>
  ///   A database specific result from the `UPDATE` statement.
  ///   In the future all "database specific" results will be
  ///   abstracted away. So in the future, this will likely return
  ///   the number of rows updated as a `number` (**HELP WANTED**).
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select which models/rows to update.
  ///     The "root model" of the query is the table/bucket that
  ///     will be updated.
  ///   attributes: object | Model
  ///     The attributes to set across all updated rows.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async updateAll(_queryEngine, model, _options) {
    throw new Error(`${this.constructor.name}::updateAll: This operation is not supported for this connection type.`);
  }

  /// Destroy the provided models.
  ///
  /// This method will bulk-iterate the specified
  /// models and will destroy each one. A primary key field
  /// is required for every model, or this method will throw
  /// an exception.
  ///
  /// The `skipHooks` option (see <see>ConnectionBase.runSaveHooks</see>) won't
  /// do anything here, because Mythix ORM doesn't have any `on*Destroy` hooks.
  /// Mythix ORM doesn't have any destroy hooks for performance reasons.
  /// However, the `batchSize` option is still useful for this method.
  ///
  /// Note:
  ///   **WARNING!!!**: If you supply `null` or `undefined` as the `models`
  ///   argument then this method will silently return. If you also supply
  ///   the option `{ truncate: true }` then the entire table will be truncated.
  ///   This option is an "opt-in", to make sure you don't truncate an entire
  ///   table on accident.
  ///
  /// Note:
  ///   Some databases (i.e. SOLR) don't support a `TRUNCATE` statement,
  ///   and so will deliberately call this method with `null` for the `models`
  ///   argument for `truncate` operations. When doing so they will also
  ///   deliberately supply the `{ truncate: true }` option.
  ///
  /// Return: Promise<Array<Model> | Model>
  ///   If you provide an array of models, then an array of models will be
  ///   returned. If you provide only a single model, then a single
  ///   model will be returned.
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model class used for the operation. This defines what
  ///     table/bucket to delete from.
  ///   models: Array<Model | object> | object | <see>Model</see>
  ///     The model(s) to delete from the database. If raw objects are provided,
  ///     then they must contain a `primaryKey` for each model. If any of the
  ///     models provided don't contain a `primaryKey` field, then an exception
  ///     will be thrown. If you have a table/bucket that has no primary key column,
  ///     then you will need to destroy rows manually yourself using a manual query
  ///     with <see>ConnectionBase.query</see>, or by using the <see>ConnectionBase.destroy</see> method.
  ///   options?: object
  ///     Most of these options are database/driver specific. However, the following
  ///     options are common across all database drivers (`skipHooks` is not supported in this context):
  ///     | Option | Type | Default Value | Description |
  ///     | ------------- | ---- | ------------- | ----------- |
  ///     | `batchSize` | `number` | `500` | The size of each batch during a multi-model destroy operation. |
  // eslint-disable-next-line no-unused-vars
  async destroyModels(Model, _models, _options) {
    throw new Error(`${this.constructor.name}::destroyModels: This operation is not supported for this connection type.`);
  }

  /// Destroy multiple models by query, or by the
  /// provided models themselves. If models are provided,
  /// then each model must have a valid primary key field,
  /// or an exception will be thrown.
  ///
  /// If models are provided as the second argument, then
  /// it is required that the first argument be a <see>Model</see>
  /// class. In this case, this method simply calls
  /// <see>ConnectionBase.destroyModels</see> to complete the operation.
  ///
  /// If the first argument is a <see>QueryEngine</see> instance,
  /// then rows will be deleted from the database using the provided query.
  /// In this case, it is expected that the second argument
  /// will be the "options" for this operation instead of an array of models.
  ///
  /// Return: Promise<Array<Models> | Model | number>
  ///   Return the models deleted (if models were provided),
  ///   or the number of rows deleted (if a query was provided).
  ///
  /// Arguments:
  ///   queryOrModel: class <see>Model</see> | <see>QueryEngine</see>
  ///     A <see>QueryEngine</see> instance to specify which models to
  ///     delete via a query, or a <see>Model</see> class if models are
  ///     being provided to be deleted.
  ///   modelsOrOptions: Array<Model> | Model | object
  ///     If a <see>QueryEngine</see> instance is provided as the first argument
  ///     then this is expected to be the "options" for the operation. If however
  ///     a <see>Model</see> class is provided as the first argument, then this
  ///     should be a <see>Model</see> instance, or an array of <see>Model</see> instances.
  ///   options?: object | undefined
  ///     Most of these options are database/driver specific.
  ///     The `batchSize` option is ignored if a <see>QueryEngine</see> instance is provided as the
  ///     first argument to the call. If a <see>Model</see> class is provided as the first argument to
  ///     the call, then this `options` object will be at argument index `1` instead (the second argument, `modelsOrOptions`).
  ///     The following options are common across all database drivers
  ///     (`skipHooks` is not supported in this context):
  ///     | Option | Type | Default Value | Description |
  ///     | ------------- | ---- | ------------- | ----------- |
  ///     | `batchSize` | `number` | `500` | The size of each batch during a multi-model destroy operation. |
  // eslint-disable-next-line no-unused-vars
  async destroy(_queryEngineOrModel, modelsOrOptions, _options) {
    throw new Error(`${this.constructor.name}::destroy: This operation is not supported for this connection type.`);
  }

  /// Select data from the underlying database.
  ///
  /// To select data from the database you will use this method,
  /// providing a `query` as a <see>QueryEngine</see> instance.
  /// The provided query will be used to generate the underlying
  /// request to the database, will collect the response, and return
  /// the results to the caller.
  ///
  /// This method is an async generator method, and is designed for
  /// "streaming" results from the database, one "row" at a time. Many
  /// methods that call this method (such as <see>QueryEngine.all</see>)
  /// collect all the results from the async generator to return an array
  /// of results to the caller. This is because it is often tedious to
  /// collect the results yourself from the async generator, and often the
  /// caller simply wants a small amount of data from the database.
  /// However, if you intend to fetch large amounts of data from your database,
  /// it is a good idea to call this method directly, and iterate the results
  /// of the async generator manually. All methods that in-turn call this
  /// method (such as <see>QueryEngine.all</see>) will generally have a
  /// `{ stream: true }` option that can be provided, causing the method to
  /// return the async generator, instead of the collected results.
  ///
  ///
  /// Return: AsyncGenerator<Model>
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query to run against the underlying database. This is generated
  ///     from a <see>QueryEngine</see> interface. The result of this <see>QueryEngine</see>
  ///     instance will then be converted to a query, or generated code to
  ///     interact with the underlying database.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars, require-yield
  async *select(_queryEngine, _options) {
    throw new Error(`${this.constructor.name}::select: This operation is not supported for this connection type.`);
  }

  /// Aggregate data across rows.
  ///
  /// Though this method can be called directly, it is generally called from
  /// one of <see>ConnectionBase.average</see>, <see>ConnectionBase.sum</see>,
  /// <see>ConnectionBase.count</see>, <see>ConnectionBase.min</see>,
  /// or <see>ConnectionBase.max</see>, or one of the other aggregate methods
  /// provided by the connection.
  ///
  /// It takes a `query` which is used to generate a query for the underlying
  /// database, and sets the query `PROJECTION` to the aggregate `literal` provided.
  /// For example, a `sum` method call would call this method with a `SumLiteral`,
  /// which would change the `query` projection to the expanded result of the
  /// `SumLiteral`, returning the "sum" of all column values targeted by the literal field.
  /// The results will then be collected, and always returned as a `number` primitive
  /// to the caller.
  ///
  /// Return: Promise<number>
  ///   The result of the aggregate operation, as a number.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select which rows to aggregate across.
  ///   literal: <see>LiteralBase</see>
  ///     A literal, used as the aggregate function. For example, if a
  ///     <see>CountLiteral</see> is provided, then the count of all rows
  ///     matching the provided query will be the result.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async aggregate(_queryEngine, _literal, options) {
    throw new Error(`${this.constructor.name}::aggregate: This operation is not supported for this connection type.`);
  }

  /// Get the average for a single column, spanning all matching rows.
  ///
  /// This will return the average of all values in a column,
  /// across all matching rows, as a `number` primitive.
  ///
  /// Return: Promise<number>
  ///   The average of all matching columns.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select which rows are used to calculate the average.
  ///   field: <see>Field</see> | string
  ///     A field instance, or a fully qualified field name, used as the target
  ///     column in the underlying database to calculate an average across all matching values.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async average(_queryEngine, _field, options) {
    throw new Error(`${this.constructor.name}::average: This operation is not supported for this connection type.`);
  }

  /// Get the number of rows matching the query.
  ///
  /// This will return the number of rows matching
  /// the provided query, as a `number` primitive.
  ///
  /// Note:
  ///   In most databases, if the `field` argument is not
  ///   specified, then the count operation will be across
  ///   all table columns (`COUNT(*)`).
  ///
  /// Return: Promise<number>
  ///   The count (number) of all rows matching the provided query.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select which rows to count.
  ///   field: <see>Field</see> | string
  ///     A field instance, or a fully qualified field name, used as the target
  ///     column in the underlying database to count the rows. If not specified,
  ///     then most database drivers will count across all columns (i.e. `COUNT(*)`).
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async count(_queryEngine, _field, options) {
    throw new Error(`${this.constructor.name}::count: This operation is not supported for this connection type.`);
  }

  /// Get the minimum value for a column, spanning all matching rows.
  ///
  /// This will return the minimum of all values in a column,
  /// across all matching rows, as a `number` primitive.
  ///
  /// Return: Promise<number>
  ///   The minimum value found across all matching rows.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select which rows are used to calculate the minimum.
  ///   field: <see>Field</see> | string
  ///     A field instance, or a fully qualified field name, used as the target
  ///     column in the underlying database to find the minimum across all matching values.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async min(_queryEngine, _field, options) {
    throw new Error(`${this.constructor.name}::min: This operation is not supported for this connection type.`);
  }

  /// Get the maximum value for a column, spanning all matching rows.
  ///
  /// This will return the maximum of all values in a column,
  /// across all matching rows, as a `number` primitive.
  ///
  /// Return: Promise<number>
  ///   The maximum value found across all matching rows.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select which rows are used to calculate the maximum.
  ///   field: <see>Field</see> | string
  ///     A field instance, or a fully qualified field name, used as the target
  ///     column in the underlying database to find the maximum across all matching values.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async max(_queryEngine, _field, options) {
    throw new Error(`${this.constructor.name}::max: This operation is not supported for this connection type.`);
  }

  /// Get the sum of all values for a column, spanning all matching rows.
  ///
  /// This will return the sum of all values in a column,
  /// across all matching rows, as a `number` primitive.
  ///
  /// Return: Promise<number>
  ///   The sum of all values found across all matching rows.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select which rows are used to calculate the sum.
  ///   field: <see>Field</see> | string
  ///     A field instance, or a fully qualified field name, used as the target
  ///     column in the underlying database to find the sum of all matching values.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async sum(_queryEngine, _field, options) {
    throw new Error(`${this.constructor.name}::sum: This operation is not supported for this connection type.`);
  }

  /// Pluck only specific columns/fields from the
  /// underlying database, using the provided `query`.
  ///
  /// This method will return only the specified `fields`
  /// from the database--as raw values--from rows matched
  /// on by the provided query.
  ///
  /// This method is often much faster than a normal `select` operation,
  /// in that only the data requested will be transmitted from the database,
  /// and models won't be constructed and stitched together on load. Use this
  /// when you just need an "array of values" across certain columns from a table.
  ///
  /// Return: Array<any> | Array<Array<any>> | Array<object>
  ///   If the provided `fields` argument is an array of fields
  ///   (fully qualified field names, or <see>Field</see> instances),
  ///   then the result will be an array of arrays, where each item
  ///   in the top-level array is a "row", and each sub-array is the
  ///   values for the columns (fields) specified. If a single field
  ///   is specified, then an one dimensional array is returned, where
  ///   each item is the column value for each row fetched.
  ///   For example, if we call `pluck` like: `let result = await connection.pluck(User.where.firstName.EQ('Bob'), 'User:id')`
  ///   then the `result` would look like `[ 'USER_id_1`, `USER_id_2`, ... ]`
  ///   where each value in the array is a user id. If however we call pluck like:
  ///   `let result = await connection.pluck(User.where.firstName.EQ('Bob'), [ 'User:id', 'User:firstName' ])`
  ///   then the `result` would look like `[ [ 'USER_id_1', 'Bob' ], [ 'USER_id_2', 'Bob' ], ... ]`, because
  ///   the provided `fields` is an array, an array of field values will be returned from each row.
  ///   If the `option` `mapToObjects` is `true`, then an array of objects will be returned,
  ///   where each object is a "row", and each property one of the specified fields. Note that
  ///   the properties of each returned object will be the fully qualified field name of each field
  ///   specified. So, for example, specifying a pluck field of `User:id` means that each returned
  ///   object in the array will look like `[ { 'User:id': 'USER_id_1' }, { 'User:id': 'USER_id_2' }, ... ]`.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select rows from which columns will be plucked.
  ///   fields: <see>Field</see> | string | Array<Field> | Array<string>
  ///     Which fields to "pluck" from the matching rows. If an array is provided (even if
  ///     it only contains a single field), then an array of arrays will be returned
  ///     as the result. If a single field is provided (not an array), then an array
  ///     of raw plucked column values will be returned instead.
  ///   options?: object
  ///     Operation specified options. These might change based on the database driver you
  ///     are using, so please refer to your specific database driver documentation. One
  ///     option that is common across all drivers is the `mapToObjects` boolean option.
  ///     If `true`, then each row in the returned array will be an object instead of
  ///     raw column values, where the property of each "row object" will be the fully
  ///     qualified names of each field provided as the `fields` argument.
  // eslint-disable-next-line no-unused-vars
  async pluck(_queryEngine, _fields, _options) {
    throw new Error(`${this.constructor.name}::pluck: This operation is not supported for this connection type.`);
  }

  /// Check if any rows match the provided `query`.
  ///
  /// Return: boolean
  ///   `true` if one or more rows match the provided query, or `false` otherwise.
  ///
  /// Arguments:
  ///   query: <see>QueryEngine</see>
  ///     The query used to select rows, to check if said rows exist in the database.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async exists(queryEngine, options) {
    throw new Error(`${this.constructor.name}::exists: This operation is not supported for this connection type.`);
  }

  /// Truncate (erase/clear) the entire table/bucket defined
  /// by the provided `Model`. All rows/objects from the underlying
  /// table/bucket will be destroyed, leaving you with an empty
  /// table/bucket.
  ///
  /// Return: Promise<void>
  ///
  /// Arguments:
  ///   Model: class <see>Model</see>
  ///     The model class that defines the underlying table/bucket to wipe clean/erase.
  ///   options?: object
  ///     Operation specific options. These will change depending on the database
  ///     driver you are using. Please refer to the documentation for your specific
  ///     driver for more information.
  // eslint-disable-next-line no-unused-vars
  async truncate(Model, options) {
    throw new Error(`${this.constructor.name}::truncate: This operation is not supported for this connection type.`);
  }

  /// "raw" database/driver specific query interface.
  ///
  /// For SQL based databases, this would send a direct
  /// query string to the database. For other drivers, the
  /// arguments and operations that are executed might change.
  ///
  /// Use this method to directly interact with the underlying
  /// database, in its own native query language.
  ///
  /// The arguments and return value from this method is database/driver
  /// specific. Any `options` argument the database provides are also
  /// specific to the underlying database driver. However, one option
  /// is common across all drivers, and this is the `logger` option. If
  /// set, it is expected to have a `log` method in the provided `logger`
  /// object. Oftentimes, this will simply be `{ logger: console }`, but
  /// you can provided any custom `logger` instance you want, as long as it
  /// has a `log` method that can be called to log the results of the query.
  /// Most drivers also support a `{ logger }` option as a connection option
  /// when the connection is first instantiated, which will provided logging
  /// to every query that goes through the connection.
  ///
  /// Return: database specific
  ///   A database/driver specific return value, based on the query provided.
  // eslint-disable-next-line no-unused-vars
  async query(lucene, options) {
    throw new Error(`${this.constructor.name}::query: This operation is not supported for this connection type.`);
  }

  /// Initiate a transaction (or snapshot/sub-transaction)
  /// if the database driver supports transactions.
  ///
  /// This will initiate a transaction in the underlying database,
  /// if the database supports it. For SQL type databases this would
  /// be a `BEGIN/COMMIT/ROLLBACK` block. If this method is called
  /// when a transaction is already in-progress, then a snapshot/sub-transaction
  /// will be started instead.
  ///
  /// This method will start a transaction in the underlying database,
  /// and call the provided asynchronous callback. If the callback throws
  /// an error, then the transaction (or snapshot) will be automatically
  /// rolled-back. There is a single `connection` argument that will be
  /// provided to the callback function when called. This `connection` argument
  /// will be the transaction connection itself, which for many database drivers is simply
  /// the same connection the transaction was started from. At a lower-level,
  /// Mythix ORM  will use an [AsyncLocalStorage](https://nodejs.org/docs/latest-v16.x/api/async_context.html)
  /// context to provide the transaction connection to all code executed inside
  /// the callback, so the provided `connection` argument can generally be ignored.
  /// However, if [AsyncLocalStorage](https://nodejs.org/docs/latest-v16.x/api/async_context.html) isn't
  /// supported in your environment, or the specific driver you are using requires that you use
  /// the supplied `connection` argument, then you must use the supplied `connection`
  /// for all your operations, and provide it as the `{ connection }` option to all Mythix ORM
  /// calls made inside the callback.
  ///
  /// Return: Promise<any>
  ///   Return whatever return value is returned from the provided callback.
  ///
  /// Arguments:
  ///   callback: (connection: <see>Connection</see>) => any
  ///     The async callback to call for the transaction operation. This should return as quickly as
  ///     possible to avoid deadlocks in the underlying database. Whatever value this method
  ///     returns will be the return value from the `transaction` call itself. If an exception is
  ///     thrown in this method, then the transaction will be automatically rolled-back. If no
  ///     exception is thrown from this method, then when done executing, a `COMMIT` will be sent
  ///     to the underlying database automatically for you.
  ///   options?: object
  ///     Optional database specific options to supply for the transaction operation. There are two
  ///     options that are supported across most database drivers, and those are `connection` and `lock`.
  ///     The `connection` option supplies the the connection to initiate the transaction from, which for
  ///     example might be another transaction connection (initiating a sub-transaction). If no `connection`
  ///     option is supplied, then the `connection` this method was called from is used instead. The second
  ///     common option is `lock`, which specifies how/if to lock the table for the transaction.
  ///     See <see>ConnectionBase.getLockMode</see> for your specific driver for more information on this `lock` option.
  // eslint-disable-next-line no-unused-vars
  async transaction(callback, options) {
    throw new Error(`${this.constructor.name}::transaction: This operation is not supported for this connection type.`);
  }
}
