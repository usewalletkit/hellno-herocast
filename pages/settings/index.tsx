import React, { useEffect, useState } from "react";
import AlertDialogDemo from "@/common/components/AlertDialog";
import HelpCard from "@/common/components/HelpCard";
import { classNames } from "@/common/helpers/css";
import { Button } from "@/components/ui/button";
import {
  AccountObjectType,
  PENDING_ACCOUNT_NAME_PLACEHOLDER,
  accountCommands,
  channelCommands,
  hydrate,
  useAccountStore,
} from "@/stores/useAccountStore";
import { newPostCommands } from "@/stores/useNewPostStore";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/router";
import { getNavigationCommands } from "@/getNavigationCommands";
import AccountManagementModal from "@/common/components/AccountManagement/AccountManagementModal";
import { useAccount } from "wagmi";
import { AccountPlatformType } from "@/common/constants/accounts";
import { Loading } from "@/common/components/Loading";
import { ArrowPathIcon } from "@heroicons/react/20/solid";
import SwitchWalletButton from "@/common/components/SwitchWalletButton";
import { createClient } from "@/common/helpers/supabase/component";
import { usePostHog } from "posthog-js/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type SimpleCommand = {
  name: string;
  shortcut: string;
};

export default function Settings() {
  const router = useRouter();
  const supabase = createClient();
  const posthog = usePostHog();

  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] =
    useState<AccountObjectType | null>(null);

  const {
    hydratedAt,
    accounts,
    resetStore,
    removeAccount,
    updateAccountUsername,
  } = useAccountStore();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const onLogout = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      resetStore();
      setUser(null);
      await supabase.auth.signOut();
      posthog.reset();
    }

    router.push("/login");
  };

  const displayEmail = user?.email
    ? `${user?.email.slice(0, 5)}...@${user?.email.split("@")[1]}`
    : "";

  const onClickManageAccount = (account: AccountObjectType) => {
    setSelectedAccount(account);
    setOpen(true);
  };

  const refreshAccountNames = async () => {
    setIsLoading(true);
    await Promise.all(
      accounts.map(async (account) => await updateAccountUsername(account.id))
    )
      .then(() => {
        console.log("All account names refreshed successfully");
        hydrate();
      })
      .catch((error) =>
        console.error("Error refreshing account names:", error)
      );
    setIsLoading(false);
  };

  const renderInfoSection = () => {
    const allCommands = [
      { name: "Command Palette", shortcut: "cmd+k" },
      { name: "Feed: go to previous cast in list", shortcut: "k" },
      { name: "Feed: go to next cast in list", shortcut: "j" },
      { name: "Feed: Open thread view for cast", shortcut: "Enter or o" },
      { name: "Feed: Open embedded link in new tab", shortcut: "shift+o" },
      ...getNavigationCommands({ router }),
      ...newPostCommands,
      ...accountCommands,
      ...channelCommands,
    ];

    const commandsWithShortcuts: SimpleCommand[] = allCommands.filter(
      (command) => command.shortcut !== undefined
    );

    return (
      <div className="w-full max-w-xl mt-20 overflow-hidden">
        <div className="border-b border-border"></div>
        <Collapsible>
          <CollapsibleTrigger>
            <h3 className="mt-4 text-md font-semibold leading-7 text-foreground/80">
              Hotkeys / Keyboard Shortcuts (click to expand)
            </h3>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-muted">
              <dl className="divide-y divide-muted">
                {commandsWithShortcuts.map((command) => (
                  <div
                    key={`command-${command.name}`}
                    className="px-2 py-4 sm:grid sm:grid-cols-3 sm:gap-4"
                  >
                    <dt className="text-sm text-foreground/60">
                      {command.name}
                    </dt>
                    {command.shortcut && (
                      <dd className="mt-1 text-sm leading-6 font-semibold text-foreground sm:col-span-1 sm:mt-0">
                        {command.shortcut.replace(/\+/g, " + ")}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  return (
    <div className="ml-10 mt-10 flex flex-col space-y-4">
      <div className="border-b border-gray-200">
        <h1 className="text-xl font-semibold leading-7 text-foreground/80">
          Herocast account
        </h1>
      </div>
      <div className="flex flex-row mt-4 pr-2">
        <span className="text-sm font-semibold text-foreground/80 mr-2">
          Email
        </span>
        <span className="text-sm font-semibold text-foreground/70 ">
          {displayEmail}
        </span>
      </div>
        <Button variant="default" onClick={() => onLogout()} className="w-20">
          Log out
        </Button>
      <div className="flex flex-row gap-4">
        <SwitchWalletButton />
      </div>
      <div className="flex justify-between pb-2 border-b border-gray-200">
        <h1 className="text-xl font-semibold leading-7 text-foreground/80">
          Farcaster accounts
        </h1>
        <Button
          variant="outline"
          className="h-8"
          disabled={isLoading}
          onClick={() => refreshAccountNames()}
        >
          Reload accounts
          <ArrowPathIcon
            className={classNames(
              isLoading ? "animate-spin" : "",
              "ml-1 w-4 h-4"
            )}
          />
        </Button>
      </div>
      {!hydratedAt && <Loading />}
      <ul role="list" className="divide-y divide-white/5">
        {accounts.map((item: AccountObjectType, idx: number) => (
          <li key={item.id} className="px-2 py-2">
            <div className="flex items-center gap-x-3">
              <h3
                className={classNames(
                  "text-foreground/80",
                  "flex-auto truncate text-sm font-semibold leading-6"
                )}
              >
                {item.name || PENDING_ACCOUNT_NAME_PLACEHOLDER}
              </h3>
              {item.platformAccountId && item.status !== "active" && (
                <p className="truncate text-sm text-foreground/80">
                  {item.status}
                </p>
              )}
              {item.platform ===
                AccountPlatformType.farcaster_hats_protocol && (
                <p className="text-sm">🧢</p>
              )}
              {item.platformAccountId && item.status === "active" && (
                <p className="font-mono truncate text-sm text-foreground/80">
                  fid: {item.platformAccountId}
                </p>
              )}
              <Button
                variant="secondary"
                onClick={() => onClickManageAccount(item)}
              >
                Manage
              </Button>
              <AlertDialogDemo
                buttonText={`Remove`}
                onClick={() => removeAccount(item.id)}
              />
            </div>
          </li>
        ))}
      </ul>
      <HelpCard />
      {renderInfoSection()}
      <AccountManagementModal
        account={selectedAccount}
        open={open}
        setOpen={setOpen}
      />
    </div>
  );
}
