export const alerts = [
  { id: 1, level: 'critical', title: 'Flash Flood Warning', region: 'Pune • Mula-Mutha basin', time: '2 min ago', body: 'Move to elevated ground and avoid river crossings. Emergency teams are on standby.' },
  { id: 2, level: 'warning', title: 'Heatwave Advisory', region: 'Vidarbha • Nagpur', time: '16 min ago', body: 'Stay hydrated and use designated cooling centres between 11:00 and 16:00.' },
  { id: 3, level: 'info', title: 'Community Kitchen Active', region: 'Satara • Camp 04', time: '28 min ago', body: 'Free meals available for displaced families. Bring your household token.' },
  { id: 4, level: 'warning', title: 'Road Diversion', region: 'Kothrud • Karve Road', time: '42 min ago', body: 'Emergency lane reserved. Use alternate routes to keep rescue traffic moving.' }
];
export const campaigns = [
  { id: 1, name: 'Monsoon Ready Maharashtra', org: 'State Disaster Management Authority', tag: 'Preparedness', reach: '2.4M', status: 'Live', location: 'Pune District', copy: 'Know your nearest shelter, pack a go-bag, save 112.' },
  { id: 2, name: 'Safe Roads, Safe Rescue', org: 'Pune Municipal Response Cell', tag: 'Traffic', reach: '760K', status: 'Live', location: 'Pune City', copy: 'Leave rescue lanes clear for ambulances and fire response.' },
  { id: 3, name: 'Every Hand Helps', org: 'Seva Collective NGO Network', tag: 'Volunteering', reach: '390K', status: 'Recruiting', location: 'Pune • Satara', copy: 'Register skills for logistics, first aid, food distribution and translation.' },
  { id: 4, name: 'Family Reunification Drive', org: 'District Relief Office', tag: 'Relief', reach: '120K', status: 'Live', location: 'Maharashtra', copy: 'Use verified helplines and shelter desks to reconnect separated families.' },
  { id: 5, name: 'First Aid Fast Track', org: 'Red Cross Unit', tag: 'Medical', reach: '210K', status: 'Recruiting', location: 'Pune • Pimpri-Chinchwad', copy: 'Learn bleeding control, CPR basics and emergency triage.' },
  { id: 6, name: 'Heatwave Community Cooling', org: 'Nagpur Smart Response', tag: 'Health', reach: '580K', status: 'Live', location: 'Nagpur', copy: 'Open cooling rooms and hydration points for at-risk residents.' }
];
export const shelters = [
  { id: 1, name: 'Shivaji Sports Complex', city: 'Pune', address:'Pune, Maharashtra', capacity: 850, occupied: 642, services: ['Food','Medical','Childcare'], eta: '12 min', open:true },
  { id: 2, name: 'Bharati Vidyapeeth Hall', city: 'Pune', address:'Katraj, Pune', capacity: 520, occupied: 301, services: ['Food','Power','Wi-Fi'], eta: '19 min', open:true },
  { id: 3, name: 'ZP School Relief Centre', city: 'Satara', address:'Satara, Maharashtra', capacity: 340, occupied: 238, services: ['Food','Water','First Aid'], eta: '31 min', open:true },
  { id: 4, name: 'Nehru Stadium Transit Camp', city: 'Nagpur', address:'Nagpur, Maharashtra', capacity: 1100, occupied: 924, services: ['Food','Medical','Charging'], eta: '44 min', open:true },
  { id: 5, name: 'Aundh Community Hall', city:'Pune', address:'Aundh, Pune', capacity: 430, occupied: 176, services:['Water','Childcare','Charging'], eta:'23 min', open:true }
];
export const requests = [
  { id:'RQ-1048', citizen:'Asha K.', type:'Medical', location:'Kothrud', priority:'Critical', status:'Assigned', team:'Red Cross Unit 03', time:'09:41' },
  { id:'RQ-1047', citizen:'Rohit M.', type:'Food', location:'Warje', priority:'High', status:'In transit', team:'Seva Volunteers', time:'09:36' },
  { id:'RQ-1046', citizen:'Nikita P.', type:'Evacuation', location:'Dhayari', priority:'High', status:'Verified', team:'Fire Response 2', time:'09:29' },
  { id:'RQ-1045', citizen:'Aman S.', type:'Missing family', location:'Sinhagad Rd', priority:'Medium', status:'Open', team:'—', time:'09:23' },
  { id:'RQ-1044', citizen:'Rhea T.', type:'Water', location:'Pashan', priority:'Medium', status:'Open', team:'—', time:'09:16' }
];
export const incidents = [
  { id:'INC-077', type:'Flood', location:'Pune • Mula-Mutha basin', severity:'Critical', affected:'2,482', reports:46, status:'Active' },
  { id:'INC-076', type:'Landslide', location:'Lonavala • Old Mumbai Rd', severity:'High', affected:'218', reports:18, status:'Response' },
  { id:'INC-075', type:'Fire', location:'Nashik • MIDC', severity:'High', affected:'624', reports:11, status:'Containment' },
  { id:'INC-074', type:'Heatwave', location:'Nagpur • Central zone', severity:'Medium', affected:'5,870', reports:92, status:'Monitoring' }
];
export const activities = [
  '14 volunteers accepted logistics tasks in Camp 04',
  'Shelter occupancy synced across Pune district',
  'Emergency broadcast acknowledged by 92% of users',
  'Medical unit 07 dispatched to Kothrud',
  'Aundh Community Hall opened 120 extra beds'
];
export const volunteers = [
  { id:'VOL-331', name:'Meera P.', skill:'First Aid', area:'Pune', status:'Available', missions:18 },
  { id:'VOL-284', name:'Arjun S.', skill:'Logistics', area:'Satara', status:'On mission', missions:31 },
  { id:'VOL-198', name:'Sara K.', skill:'Translation', area:'Pune', status:'Available', missions:11 },
  { id:'VOL-412', name:'Kabir R.', skill:'Driving', area:'Pune', status:'On mission', missions:24 }
];
export const audits = [
  {time:'12:42', actor:'Officer #024', action:'broadcast Flood Alert', severity:'high'},
  {time:'12:35', actor:'NGO #018', action:'accepted Request #RQ-1048', severity:'info'},
  {time:'12:31', actor:'Admin #001', action:'updated shelter capacity', severity:'info'},
  {time:'12:20', actor:'Citizen #781', action:'reported flood incident', severity:'medium'},
  {time:'12:11', actor:'Officer #024', action:'verified Request #RQ-1046', severity:'info'}
];
