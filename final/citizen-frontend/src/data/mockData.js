export const citizen = {
  name: "Mohamed Ghazi",
  zone: "Sfax Centre",
};

export const electricityStatus = {
  status: "available",
  label: "Power Available",
  description: "Electricity is currently available in your zone.",
};

export const schedule = [
  {
    id: 1,
    date: "2026-09-22",
    start: "14:00",
    end: "14:45",
    duration: 45,
    status: "planned",
  },
  {
    id: 2,
    date: "2026-09-22",
    start: "19:00",
    end: "19:45",
    duration: 45,
    status: "planned",
  },
];

export const notifications = [
  {
    id: 1,
    title: "Schedule updated",
    message: "Tomorrow's shedding schedule has been updated.",
    time: "10 min ago",
  },
  {
    id: 2,
    title: "Planned interruption",
    message:
      "Your zone has a planned interruption tomorrow at 14:00.",
    time: "1 hour ago",
  },
];