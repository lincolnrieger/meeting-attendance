/**
 * Ready-made starting points for Settings → Organisation. Applying one fills in
 * the terminology and suggestion lists, which can then be edited freely.
 */
export const PRESETS = [
  {
    key: 'general',
    label: 'General / community group',
    participant: ['Participant', 'Participants'],
    event: ['Meeting', 'Meetings'],
    roles: ['Leader', 'Assistant Leader', 'Coordinator', 'Secretary', 'Treasurer', 'Member', 'Volunteer', 'Guest'],
    locations: ['Main Hall', 'Meeting Room 1', 'Meeting Room 2', 'Online (video call)'],
    titles: ['General Meeting', 'Committee Meeting', 'Workshop', 'Training Session', 'Annual General Meeting'],
  },
  {
    key: 'school',
    label: 'School / classes',
    participant: ['Student', 'Students'],
    event: ['Class', 'Classes'],
    roles: ['Student', 'Class Captain', 'Prefect', 'Teacher', 'Teaching Assistant', 'Relief Teacher', 'Parent Helper', 'Visitor'],
    locations: ['Classroom 1', 'Classroom 2', 'Science Lab', 'Library', 'Gymnasium', 'School Hall', 'Online'],
    titles: ['Homeroom', 'English', 'Mathematics', 'Science', 'History', 'Physical Education', 'Excursion', 'Assembly'],
  },
  {
    key: 'scouts',
    label: 'Scouts / youth group',
    participant: ['Member', 'Members'],
    event: ['Meeting', 'Meetings'],
    roles: ['Joey Scout', 'Cub Scout', 'Scout', 'Venturer Scout', 'Rover', 'Patrol Leader', 'Scout Leader', 'Assistant Scout Leader', 'Group Leader', 'Parent Helper'],
    locations: ['Scout Hall', 'Camp Ground', 'Bushwalk Trailhead', 'Local Park'],
    titles: ['Weekly Troop Meeting', 'Patrol Meeting', 'Camp', 'Hike', 'Badge Night', 'Parade'],
  },
  {
    key: 'sport',
    label: 'Sports club / team',
    participant: ['Player', 'Players'],
    event: ['Session', 'Sessions'],
    roles: ['Player', 'Captain', 'Vice-Captain', 'Coach', 'Assistant Coach', 'Team Manager', 'Trainer', 'Volunteer'],
    locations: ['Main Oval', 'Training Ground', 'Indoor Court', 'Gym', 'Clubrooms'],
    titles: ['Training', 'Match Day', 'Fitness Session', 'Team Meeting', 'Presentation Night'],
  },
  {
    key: 'board',
    label: 'Board / committee',
    participant: ['Member', 'Members'],
    event: ['Meeting', 'Meetings'],
    roles: ['Chair', 'Deputy Chair', 'Treasurer', 'Secretary', 'Director', 'Non-Executive Director', 'Independent Director', 'Observer'],
    locations: ['Boardroom', 'Meeting Room 1', 'Video conference'],
    titles: ['Board Meeting', 'Committee Meeting', 'Audit & Risk Committee', 'Strategy Day', 'Annual General Meeting'],
  },
  {
    key: 'volunteers',
    label: 'Volunteers / shifts',
    participant: ['Volunteer', 'Volunteers'],
    event: ['Shift', 'Shifts'],
    roles: ['Volunteer', 'Team Leader', 'Shift Supervisor', 'Coordinator', 'Trainee'],
    locations: ['Warehouse', 'Front Desk', 'Kitchen', 'Event Site'],
    titles: ['Morning Shift', 'Afternoon Shift', 'Evening Shift', 'Event Support', 'Induction'],
  },
  {
    key: 'workplace',
    label: 'Workplace training',
    participant: ['Employee', 'Employees'],
    event: ['Session', 'Sessions'],
    roles: ['Employee', 'Team Leader', 'Manager', 'Trainer', 'Facilitator', 'Contractor'],
    locations: ['Training Room', 'Conference Room', 'Online (Teams)', 'Online (Zoom)'],
    titles: ['Induction', 'Safety Training', 'Team Meeting', 'Workshop', 'Compliance Training'],
  },
];
