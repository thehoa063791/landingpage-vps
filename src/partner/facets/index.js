// Data a partner can read about a contact, one facet per kind of data. A facet is
// { name, scope, description, includes, load(contact, ctx), changes?(ctx), courses?(client) }.
// Adding data (zoom, orders, tags...) means adding a facet here; the API routes stay the same.
const { createLearningFacet } = require('./learning');
const { courseIds, getCourse } = require('../../learningCourses');

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

// What a key can be given: scopes with descriptions and the courses (admin form, CLI checks).
function keyOptions(facets = createFacets()) {
  return {
    scopes: Object.entries(scopeDescriptions(facets)).map(([scope, description]) => ({ scope, description })),
    courses: courseIds().map(id => ({ id, title: getCourse(id).title })),
  };
}

module.exports = { createFacets, scopeDescriptions, keyOptions, CONTACT_SCOPES };
