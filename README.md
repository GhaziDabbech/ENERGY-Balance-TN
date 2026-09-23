# ENERGY Balance TN — Citizens Dashboard

## Overview

The **Citizens Dashboard** is the citizen-facing web interface of **ENERGY Balance TN**. It provides citizens with a simple way to monitor electricity conditions, view planned shedding schedules, check other locations, and receive electricity-related information.

## Main Features

### Citizens Dashboard

The main dashboard provides:

- Citizen profile information
- Current electricity situation
- Today's electricity schedule
- Notifications
- Quick access to important services

### Electricity Schedule

Citizens can view their electricity interruption schedule, including:

- Scheduled date
- Start time
- End time
- Duration
- Current status
- Reason for the interruption

### Virtual Check

The **Virtual Check** allows a citizen to select any location in Tunisia and check:

- The current electricity situation in the selected location
- Whether shedding is currently active
- Upcoming shedding for the same day
- Scheduled start time
- Scheduled end time
- Duration of the planned interruption

This allows citizens to check locations other than their own registered area.

### Interactive Map

The dashboard includes an interactive map covering Tunisia.

Citizens can explore electricity zones geographically and view the electricity situation associated with each zone.

The map uses **Leaflet** and **OpenStreetMap** for geographic visualization.

> **Note:** The electricity statuses displayed in the current dashboard are development/demo data and are not official STÉG outage information.

### Notifications

The dashboard provides electricity-related notifications such as:

- Schedule updates
- Planned interruptions
- Energy information

### Settings

The citizen dashboard includes a settings section for managing the user's dashboard preferences and profile-related information.

### Citizen Assistant

A chatbot interface is included in the dashboard as a placeholder for the future citizen AI assistant.

The future assistant will retrieve verified information from the **ENERGY Balance TN** backend, such as electricity schedules and information about a citizen's selected area.

## Frontend Technologies

The Citizens Dashboard is built with:

- React
- Vite
- JavaScript
- CSS
- Leaflet
- React Leaflet

## Backend Integration

The dashboard is designed to communicate with the **ENERGY Balance TN** backend through **FastAPI APIs**.

The main citizen-related endpoints include:

```text
GET /api/citizen/dashboard/{citizen_id}
GET /api/zones
GET /api/zones/{zone_id}
GET /api/virtual-check?zone_id={zone_id}
GET /api/schedules
