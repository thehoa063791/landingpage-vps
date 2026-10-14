// Data a partner can read about a contact, one facet per kind of data. A facet is
// { name, scope, description, includes, load(contact, ctx), changes?(ctx), courses?(client) }.
// Adding data (zoom, orders, tags...) means adding a facet here; the API routes stay the same.
const { createLearningFacet } = require('./learning');

// Contact scopes are handled by the router itself.
const CONTACT_SCOPES = {
  'contact:basic': 'contact_id, tên, email, các phễu đã đăng ký',
  'contact:phone': 'Số điện thoại',
};

function createFacets(options = {}) {
  const list = [createLearningFacet(options.learning)];
  return Object.fromEntries(list.map(facet => [facet.name, facet]));
}

const scopeDescriptions = facets => ({ ...CONTACT_SCOPES, ...Object.fromEntries(Object.values(facets).map(facet => [facet.scope, facet.description])) });

module.exports = { createFacets, scopeDescriptions, CONTACT_SCOPES };
