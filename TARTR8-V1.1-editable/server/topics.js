// Contact-form topics: the services in "Explore Our Services", plus Other.
// The label becomes the message subject, e.g. "Web Development enquiry".
const TOPICS = {
  design: 'Design',
  product: 'Product',
  web: 'Web Development',
  mobile: 'Mobile Development',
  ai: 'AI & Machine Learning',
  team: 'Team Optimization',
  consulting: 'IT Consulting',
  devsecops: 'DevSecOps & Engineering',
  other: 'Other'
};

const subjectFor = topic => `${TOPICS[topic] || TOPICS.other} enquiry`;

module.exports = { TOPICS, subjectFor };
