// Ready-made starting points shown on the dashboard.
// Each question has a `key` so that `show_if` can point at another question
// before the questions have database ids.

const SEMESTERS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export const TEMPLATES = {
  blank: {
    title: 'Untitled form',
    blurb: 'Start from nothing and add your own questions.',
    description: '',
    theme: 'lavender',
    visual: 'none',
    fields: [],
  },

  event: {
    title: 'Event registration',
    blurb: 'Two pages of student details, with skills and CGPA for selection.',
    description: 'Register for the event. Seats are limited, and selected students will be informed.',
    theme: 'lavender',
    visual: 'confetti',
    fields: [
      { key: 'p1', type: 'page', label: 'Personal details' },
      { key: 'name', type: 'text', label: 'Full name', required: true },
      { key: 'roll', type: 'text', label: 'Roll number', required: true },
      { key: 'email', type: 'email', label: 'Email' },
      { key: 'p2', type: 'page', label: 'Academic details' },
      { key: 'sem', type: 'select', label: 'Semester', required: true, options: SEMESTERS },
      { key: 'dept', type: 'select', label: 'Department', required: true, options: ['Computer Science', 'Software Engineering', 'Information Technology', 'Other'] },
      { key: 'dept_other', type: 'text', label: 'Which department?', required: true, show_if: { field: 'dept', value: 'Other' } },
      { key: 'cgpa', type: 'number', label: 'CGPA' },
      { key: 'skills', type: 'checkbox', label: 'Skills', options: ['Programming', 'Design', 'Public speaking', 'Event management', 'Photography'] },
      { key: 'why', type: 'textarea', label: 'Why do you want to attend?' },
    ],
  },

  feedback: {
    title: 'Feedback form',
    blurb: 'A rating, with a follow-up question when the rating is poor.',
    description: 'Tell us how it went. It takes one minute.',
    theme: 'rose',
    visual: 'hearts',
    fields: [
      { key: 'name', type: 'text', label: 'Your name' },
      { key: 'rating', type: 'radio', label: 'Overall rating', required: true, options: ['Excellent', 'Good', 'Average', 'Poor'] },
      { key: 'wrong', type: 'textarea', label: 'Sorry to hear that. What went wrong?', show_if: { field: 'rating', value: 'Poor' } },
      { key: 'liked', type: 'textarea', label: 'What did you like?' },
      { key: 'improve', type: 'textarea', label: 'What should we improve?' },
    ],
  },

  contact: {
    title: 'Contact us',
    blurb: 'Questions and problems, with an optional screenshot.',
    description: 'Send us a message and we will get back to you.',
    theme: 'ocean',
    visual: 'bubbles',
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true },
      { key: 'email', type: 'email', label: 'Email', required: true },
      { key: 'subject', type: 'select', label: 'Subject', required: true, options: ['General question', 'Admission', 'Fees', 'Technical problem'] },
      { key: 'message', type: 'textarea', label: 'Message', required: true },
      { key: 'shot', type: 'file', label: 'Screenshot of the problem', show_if: { field: 'subject', value: 'Technical problem' } },
    ],
  },

  survey: {
    title: 'Student survey',
    blurb: 'Semester feedback about teaching and facilities.',
    description: 'Your answers help the department improve. This survey is anonymous.',
    theme: 'forest',
    visual: 'leaves',
    fields: [
      { key: 'sem', type: 'select', label: 'Semester', required: true, options: SEMESTERS },
      { key: 'p2', type: 'page', label: 'Your experience' },
      { key: 'teaching', type: 'radio', label: 'Teaching quality', required: true, options: ['Very good', 'Good', 'Average', 'Poor'] },
      { key: 'labs', type: 'radio', label: 'Lab facilities', required: true, options: ['Very good', 'Good', 'Average', 'Poor'] },
      { key: 'recommend', type: 'radio', label: 'Would you recommend this department?', required: true, options: ['Yes', 'No'] },
      { key: 'why_not', type: 'textarea', label: 'Why not?', show_if: { field: 'recommend', value: 'No' } },
      { key: 'ideas', type: 'textarea', label: 'Any suggestions?' },
    ],
  },

  volunteer: {
    title: 'Volunteer sign-up',
    blurb: 'Available days, preferred role and a CV upload.',
    description: 'Help us run the event. Pick the days and the role that suit you.',
    theme: 'galaxy',
    visual: 'fireflies',
    fields: [
      { key: 'name', type: 'text', label: 'Full name', required: true },
      { key: 'phone', type: 'text', label: 'Phone number', required: true },
      { key: 'days', type: 'checkbox', label: 'Available days', required: true, options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
      { key: 'role', type: 'radio', label: 'Preferred role', required: true, options: ['Registration desk', 'Stage management', 'Photography', 'Hospitality'] },
      { key: 'years', type: 'number', label: 'Years of volunteering experience' },
      { key: 'cv', type: 'file', label: 'CV (optional)' },
    ],
  },
};
