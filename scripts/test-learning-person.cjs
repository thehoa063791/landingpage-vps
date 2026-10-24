// node scripts/test-learning-person.cjs — contact step 4 in the video courses: signing in with
// another email of the same person, and a new email with the same phone + name.
// Offline database (JSON fallback in a temp folder), in-memory CRM, person lookups stubbed.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getCourse } = require('../src/learningCourses');
const { createRepository } = require('../src/learningRepository');
const { createLearningService } = require('../src/learningService');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'learning-person-test-'));
  const offline = Object.assign(new Error('test database offline'), { code: 'ECONNREFUSED' });
  const database = { query: async () => { throw offline; }, connect: async () => { throw offline; } };
  const leads = [], forms = [], inserted = [];
  const crm = {
    getRegistrations: async () => [...leads], getRegistrationById: async id => leads.find(l => l.id === id) || null,
    insertRegistration: async (row, options) => { leads.push(row); inserted.push(options); }, tagLeadByPage: async () => {}, insertEvent: async () => {},
    appendRegistrationForm: async (id, form, options) => { forms.push({ id, form, options }); },
  };
  // The person lookups the contacts layer answers in production.
  const people = { personOf: async () => null, courseRegistrationOfPerson: async () => null };
  const integrations = {
    capi: { sendRegistrationEvents: async () => {}, sendTrackEvent: async () => {}, sendLeadEvent: async () => {} },
    webhooks: { buildWebhookPayload: () => ({}), fireWebhooks: async () => {} },
    personFields: async () => ({}), lookupGeo: async () => null, emailRejection: async () => null,
    personOf: form => people.personOf(form), courseRegistrationOfPerson: (email, page) => people.courseRegistrationOfPerson(email, page),
  };
  const course = getCourse('dong-tien');
  const store = createRepository({ course: course.id, database, directory, fallback: true });
  const service = createLearningService({ course, store, crm, secret: 'learning-person-test-secret-with-32-chars!!', integrations });
  try {
    const first = await service.register({ full_name: 'Nguyễn Văn An', email: 'an@example.invalid', phone: '0901234567', region: 'Hà Nội' }, {});
    const lead = leads[0];
    assert.ok(first.access_token);
    assert.equal(inserted[0].person, null, 'A new person is passed on (sale assigned in turn)');

    // Another email already in the person's profile signs in to their registration.
    people.courseRegistrationOfPerson = async (email, page) => (email === 'an.work@example.invalid' && page === course.page_id ? lead.id : null);
    const signedIn = await service.login({ email: 'an.work@example.invalid' }, {});
    assert.equal(signedIn.user.id, lead.id);
    assert.equal(signedIn.user.email, 'an@example.invalid', 'The session is the registered one');
    await assert.rejects(service.login({ email: 'someone@example.invalid' }, {}), error => error.code === 'not_registered');
    // The registration form with that email sends the learner to the login, as for the same email.
    await assert.rejects(service.register({ full_name: 'An', email: 'an.work@example.invalid', phone: '0901234567', region: 'Hà Nội' }, {}), error => error.code === 'already_registered');

    // A new email, same phone and name: no second registration, no sign-in, history kept.
    people.personOf = async form => (form.phone === '0901234567' ? { contact_id: 'c1', owner_id: null, registrations: [{ id: lead.id, page_id: course.page_id, email: lead.email }] } : null);
    await assert.rejects(service.register({ full_name: 'An', email: 'an.new@example.invalid', phone: '0901234567', region: 'Hà Nội' }, {}),
      error => error.status === 409 && error.code === 'registered_other_email' && /a\*+n@example\.invalid/.test(error.message));
    assert.equal(leads.length, 1, 'No second registration');
    assert.deepEqual([forms.at(-1).id, forms.at(-1).options.source, forms.at(-1).form.email], [lead.id, 'repeat_other_email', 'an.new@example.invalid']);
    // The person known from another funnel only: a registration is created, with the person passed on.
    people.personOf = async () => ({ contact_id: 'c2', owner_id: 'sale-1', registrations: [{ id: 'other', page_id: 'trading', email: 'binh@example.invalid' }] });
    await service.register({ full_name: 'Trần Bình', email: 'binh.dt@example.invalid', phone: '0911111111', region: 'Hà Nội' }, {});
    assert.equal(leads.length, 2);
    assert.equal(inserted.at(-1).person.owner_id, 'sale-1', 'insertRegistration keeps the sale of the known person');
    console.log('PASS: course sign-in by another email of the same person, register sends that email to the login, a new email with the same phone + name is kept in history (no second registration, masked hint), a person known from another funnel registers with their sale.');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
