'use strict';

const {
  Literals,
  QueryGeneratorBase
} = require('mythix-orm');

const LiteralBase = Literals.LiteralBase;

/// The query generator interface for SOLR.
///
/// This class is used to generate Lucene statements for the
/// underlying SOLR database.
///
/// Extends: [QueryGeneratorBase](https://github.com/th317erd/mythix-orm/wiki/QueryGeneratorBase)
class SOLRQueryGenerator extends QueryGeneratorBase {

}

module.exports = SOLRQueryGenerator;
