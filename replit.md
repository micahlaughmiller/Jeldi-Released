# Overview

This is **Jeldi** - an enterprise ERP integration platform with a two-tier architecture:

## Product Architecture
**Overlay Layer** (Current Implementation): Unified enterprise dashboard that integrates with multiple ERP systems (SAP, NetSuite, Dynamics 365, etc.) to provide real-time business intelligence through a centralized dashboard. Features KPI monitoring, AI-powered data analysis, email automation, and WebSocket-based real-time updates.

**Full ERP Integration Layer** (Future): Complete bidirectional ERP integration with:
- Data source reliability verification and validation
- Direct read/write capabilities within ERP systems 
- In-app ERP data updates without leaving Jeldi
- Role-based access control (project managers, finance, ops, etc.)
- Real-time synchronization between Jeldi and ERP systems

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Full-Stack Architecture
- **Frontend**: React with TypeScript, Vite build system, Tailwind CSS with shadcn/ui components
- **Backend**: Express.js server with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Real-time Communication**: WebSocket integration for live KPI updates and system status

## Frontend Architecture
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management with local storage for auth tokens
- **UI Framework**: Radix UI primitives with custom styling via Tailwind CSS
- **Component Structure**: Modular components organized by feature (dashboard, layout, modals, ui)

## Backend Architecture
- **API Design**: RESTful endpoints with JWT-based authentication
- **Database Layer**: Drizzle ORM with connection pooling via Neon serverless
- **Service Layer**: Modular services for ERP integration, email handling, and AI analysis
- **Real-time Updates**: WebSocket server for broadcasting KPI updates and system status changes

## Authentication & Authorization
- **Strategy**: JWT tokens with bcrypt password hashing
- **Session Management**: Stateless authentication with token-based authorization middleware
- **User Roles**: Role-based access control system with admin and user permissions

## Database Schema
- **Users**: Authentication and profile management
- **ERP Connections**: OAuth credentials and connection status for multiple ERP systems
- **KPI Configurations**: User-defined metrics with positioning and refresh intervals
- **KPI Data**: Time-series data for historical tracking and trend analysis
- **Email Configurations**: Multi-provider email settings (Gmail, Outlook)
- **Chat History**: AI conversation logs for business intelligence queries

## AI Integration
- **Provider**: OpenAI GPT-5 for ERP data analysis and business insights
- **Functionality**: Natural language queries against ERP data with structured JSON responses
- **Features**: Trend analysis, anomaly detection, and strategic recommendations

# External Dependencies

## ERP System Integrations
- **SAP S/4HANA**: OAuth2 integration with analytics API access
- **Oracle NetSuite**: RESTlet and web services integration
- **Microsoft Dynamics 365**: Graph API integration with Office 365 connectivity
- **Additional Systems**: Workday, IFS, Epicor, Infor, Acumatica, Sage support

## Email Service Providers
- **Gmail**: Google OAuth2 with Gmail API for email sending
- **Outlook**: Microsoft Graph API for Outlook.com integration
- **Features**: Template-based email automation and multi-provider support

## Third-Party Services
- **OpenAI**: GPT-5 API for intelligent data analysis and chat functionality
- **Neon Database**: Serverless PostgreSQL with connection pooling
- **Microsoft Graph**: Outlook email integration and calendar access

## Development Tools
- **Build System**: Vite with React plugin and TypeScript support
- **Database**: Drizzle Kit for schema migrations and database management
- **UI Components**: Radix UI for accessible component primitives
- **Styling**: Tailwind CSS with custom design system variables

## Replit-Specific Features
- **Cartographer Plugin**: Development-mode navigation and debugging
- **Runtime Error Overlay**: Enhanced error handling in development
- **Connection Management**: Automated OAuth credential management for external services