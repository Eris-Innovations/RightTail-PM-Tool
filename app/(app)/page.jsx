"use client";

import {
  Folder,
  ListChecks,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  CheckSquare,
  Users,
  ClipboardList,
  Activity,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import QuickNavCard from "@/components/ui/QuickNavCard";
import ActivityItem from "@/components/activity/ActivityItem";
import DashboardCard, {
  CardLoading,
  CardError,
} from "@/components/ui/DashboardCard";
import ProjectProgressWidget from "@/components/dashboard/ProjectProgressWidget";
import TaskStatusWidget from "@/components/dashboard/TaskStatusWidget";
import TeamWorkloadWidget from "@/components/dashboard/TeamWorkloadWidget";
import UpcomingDeadlinesWidget from "@/components/dashboard/UpcomingDeadlinesWidget";
import MyTasksWidget from "@/components/dashboard/MyTasksWidget";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { useAuth } from "@/lib/auth/AuthProvider";
import { timeAgo } from "@/lib/formatters";
import { getActivityIcon } from "@/lib/activityIcon";

const quickNav = [
  { to: "/projects", icon: Folder, title: "Projects", subtitle: "Manage all projects" },
  { to: "/tasks", icon: CheckSquare, title: "Tasks", subtitle: "View and manage tasks" },
  { to: "/users", icon: Users, title: "Users", subtitle: "Manage team members" },
  { to: "/assignments", icon: ClipboardList, title: "Assignments", subtitle: "Task assignments overview" },
  { to: "/activity", icon: Activity, title: "Activity Log", subtitle: "Full audit trail" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const stats = useApi(api.dashboardStats);
  const activity = useApi(api.dashboardActivity);

  const firstName = user?.name?.split(/\s+/)[0] ?? "there";
  const activeWindow = stats.data?.activeUserWindowDays ?? 30;

  const statCards = [
    {
      label: "Total Projects",
      value: stats.data?.totalProjects ?? "—",
      hint: "Across all teams",
      icon: Folder,
      tone: "primary",
    },
    {
      label: "Total Tasks",
      value: stats.data?.totalTasks ?? "—",
      hint: "In all projects",
      icon: ListChecks,
      tone: "primary",
    },
    {
      label: "Completed Tasks",
      value: stats.data?.completedTasks ?? "—",
      hint:
        stats.data != null
          ? `${stats.data.completionRate}% completion rate`
          : "Loading…",
      icon: CheckCircle2,
      tone: "success",
    },
    {
      label: "Pending Tasks",
      value: stats.data?.pendingTasks ?? "—",
      hint: "Needs attention",
      icon: Clock,
      tone: "warning",
    },
    {
      label: "Overdue Tasks",
      value: stats.data?.overdueTasks ?? "—",
      hint:
        stats.data?.overdueTasks > 0
          ? "Past their due date"
          : "Nothing past due",
      icon: AlertTriangle,
      tone: stats.data?.overdueTasks > 0 ? "danger" : "muted",
    },
    {
      label: "Active Users",
      value: stats.data?.activeUsers ?? "—",
      hint: `Signed in within ${activeWindow}d`,
      icon: UserCheck,
      tone: "primary",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${firstName}. Here's what's happening.`}
      />

      <div className="px-8 py-6 flex flex-col gap-8">
        {/* OVERVIEW — stat cards */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 font-body">
            Overview
          </h2>
          {stats.error && <ErrorPanel error={stats.error} label="stats" />}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {statCards.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </div>
        </section>

        {/* QUICK ACTIONS — compact strip */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 font-body">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {quickNav.map((q) => (
              <QuickNavCard key={q.to} {...q} />
            ))}
          </div>
        </section>

        {/* WIDGETS — row 1: progress (2/3) · status (1/3) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <ProjectProgressWidget />
          </div>
          <div>
            <TaskStatusWidget />
          </div>
        </section>

        {/* WIDGETS — row 2: workload · deadlines */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TeamWorkloadWidget />
          <UpcomingDeadlinesWidget />
        </section>

        {/* WIDGETS — row 3: my tasks · recent activity */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div>
            <MyTasksWidget />
          </div>
          <div className="lg:col-span-2">
            <DashboardCard
              title="Recent Activity Feed"
              subtitle="Everything that happened across your workspace"
              action={
                <a
                  href="/activity"
                  className="text-xs text-primary font-medium hover:underline"
                >
                  View all
                </a>
              }
            >
              {activity.loading && <CardLoading label="Loading activity…" />}
              {activity.error && <CardError error={activity.error} />}
              {!activity.loading && activity.data?.length === 0 && (
                <div className="py-10 text-center">
                  <div className="text-sm font-medium text-foreground">
                    No activity yet
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Activity will appear here as your team works in Right Tail.
                  </div>
                </div>
              )}
              {activity.data?.map((a) => (
                <ActivityItem
                  key={a.id}
                  icon={getActivityIcon(a.icon)}
                  tone={a.tone}
                  message={a.message}
                  time={timeAgo(a.created_at)}
                />
              ))}
            </DashboardCard>
          </div>
        </section>
      </div>
    </>
  );
}

function ErrorPanel({ error, label }) {
  return (
    <div className="mb-4 p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
      <div className="font-semibold mb-1">Couldn&apos;t load {label}.</div>
      <div className="text-xs font-mono break-all">{error.message}</div>
    </div>
  );
}
