"use client";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loading } from "./Loading";
import { SignInButton, useProfile } from "@farcaster/auth-kit";
import { useState } from "react";
import { createClient } from "../helpers/supabase/component";
import { useRouter } from "next/router";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { usePostHog } from "posthog-js/react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  hydrate,
  hydrateChannels,
  useAccountStore,
} from "@/stores/useAccountStore";
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { AccountPlatformType, AccountStatusType } from "../constants/accounts";
import { useHotkeys } from "react-hotkeys-hook";
import { Key } from "ts-key-enum";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import includes from "lodash.includes";
import { User } from "@supabase/supabase-js";

const APP_FID = Number(process.env.NEXT_PUBLIC_APP_FID!);

export type UserAuthFormValues = z.infer<typeof UserAuthFormSchema>;

const UserAuthFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 8 characters.",
  }),
});

enum ViewState {
  LOGIN = "login",
  SIGNUP = "signup",
  FORGOT = "forgot",
  RESET = "reset",
  LOGGED_IN = "logged_in",
}

export function UserAuthForm({ signupOnly }: { signupOnly: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const posthog = usePostHog();
  const {
    isAuthenticated,
    profile: { username, fid },
  } = useProfile();
  const { accounts, addAccount, resetStore } = useAccountStore();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [userMessage, setUserMessage] = useState<string>("");
  const [view, setView] = useState<ViewState>(ViewState.SIGNUP);
  const [user, setUser] = useState<User | null>(null);

  const form = useForm<UserAuthFormValues>({
    resolver: zodResolver(UserAuthFormSchema),
    mode: "onSubmit",
  });

  useHotkeys(Key.Enter, signUp, [form.getValues()], { enableOnFormTags: true });

  React.useEffect(() => {
    if (router.query?.view) {
      setView(router.query.view as ViewState);
    }
  }, [router.query?.view]);

  React.useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && user.email) {
        setUser(user);
        setView(ViewState.LOGGED_IN);
        form.setValue("email", user.email);
      }
    };

    getUser();
  }, []);

  React.useEffect(() => {
    if (isAuthenticated && username && fid) {
      setupLocalAccount({ fid, username });
    }
  }, [isAuthenticated, username, fid]);

  const localAccounts = accounts.filter(
    (account) =>
      account.platform === AccountPlatformType.farcaster_local_readonly
  );

  const setupLocalAccount = async ({ fid, username }) => {
    if (!fid || !username) return;

    const hasLocalAccountCreated = localAccounts.some(
      (a) => a.platformAccountId === fid.toString()
    );
    setIsLoading(true);
    let account;
    if (hasLocalAccountCreated) {
      account = localAccounts.find(
        (a) => a.platformAccountId === fid.toString()
      );
    } else {
      setUserMessage("Setting up local account...");
      const neynarClient = new NeynarAPIClient(
        process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
      );

      const users = (
        await neynarClient.fetchBulkUsers([fid], { viewerFid: APP_FID })
      ).users;
      if (!users.length) {
        console.error("No users found for fid: ", fid);
        return;
      }

      account = {
        name: username,
        status: AccountStatusType.active,
        platform: AccountPlatformType.farcaster_local_readonly,
        platformAccountId: fid.toString(),
        user: users?.[0],
      };
      await addAccount({
        account,
        localOnly: true,
      });
    }

    await hydrateChannels();
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      setUserMessage("Error setting up local account.");
      setIsLoading(false);
      return;
    }

    posthog.identify(data?.user?.id, { isLocalOnly: true });
    setUserMessage("Setup done. Welcome to the herocast experience!");
    router.push("/feed");
    setIsLoading(false);
  };

  async function logIn() {
    if (!(await form.trigger())) return;

    setIsLoading(true);
    const { email, password } = form.getValues();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      form.setError("password", {
        type: "manual",
        message: error.message,
      });
      console.error("login error", error);
      setIsLoading(false);
      return;
    }

    posthog.identify(data?.user?.id, { email });
    await hydrate();
    router.push("/feed");
  }

  async function signUp() {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    console.log("sessionData", sessionData);
    console.log("sessionError", sessionError);

    console.log("user", user);
    return;
    if (!(await form.trigger())) return;

    setIsLoading(true);
    const { email, password } = form.getValues();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      form.setError("password", {
        type: "manual",
        message: error.message,
      });
      console.error("signup error", error);
      setIsLoading(false);
      return;
    } else {
      posthog.identify(data?.user?.id, { email });
      setUserMessage("Welcome to the herocast experience!");
      router.push("/welcome/new");
      setIsLoading(false);
    }
  }

  const resetPassword = async () => {
    const { email } = form.getValues();

    if (!email) {
      form.setError("email", {
        type: "manual",
        message: "Email is required.",
      });
      return;
    }

    setIsLoading(true);

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_URL}/login`,
    });
    setUserMessage("Sent password reset email to you");
    setView(ViewState.LOGIN);
    setIsLoading(false);
  };

  const submitNewPassword = async () => {
    const { email, password } = form.getValues();

    const { data, error } = await supabase.auth.updateUser({ password });

    if (error) {
      alert("There was an error updating your password.");
      setUserMessage("There was an error updating your password.");
      form.setError("password", {
        type: "manual",
        message: error.message,
      });
      return;
    }
    if (data?.user) alert("Password updated successfully!");

    setUserMessage("Logging you in...");
    posthog.identify(data?.user?.id, { email });
    await hydrate();
    router.push("/feed");
    setIsLoading(false);
  };

  const renderSubmitButton = () => {
    let buttonText = "";
    let buttonAction = () => {};

    switch (view) {
      case ViewState.FORGOT:
        buttonText = "Reset Password";
        buttonAction = resetPassword;
        break;
      case ViewState.LOGIN:
        buttonText = "Continue";
        buttonAction = logIn;
        break;
      case ViewState.SIGNUP:
        buttonText = "Sign Up";
        buttonAction = signUp;
        break;
      case ViewState.RESET:
        buttonText = "Set New Password";
        buttonAction = submitNewPassword;
        break;
      case ViewState.LOGGED_IN:
        buttonText = "Continue";
        buttonAction = () => router.push("/feed");
        break;
    }
    return (
      <Button
        type="button"
        size="lg"
        className="text-white text-base py-6 bg-gradient-to-r from-[#8A63D2] to-[#ff4eed] hover:from-[#6A4CA5] hover:to-[#c13ab3]"
        disabled={isLoading}
        onClick={buttonAction}
      >
        {isLoading ? <Loading className="text-white" /> : buttonText}
      </Button>
    );
  };

  const renderViewSwitchText = () => {
    switch (view) {
      case ViewState.LOGIN:
        return (
          <div
            className="mt-2 text-center text-sm hover:cursor-pointer"
            onClick={() => setView(ViewState.SIGNUP)}
          >
            Don&apos;t have an account?{" "}
            <span className="underline">Sign up</span>
          </div>
        );
      case ViewState.FORGOT:
      case ViewState.SIGNUP:
        return (
          <div
            className="mt-2 text-center text-sm hover:cursor-pointer"
            onClick={() => setView(ViewState.LOGIN)}
          >
            Already have an account? <span className="underline">Log in</span>
          </div>
        );
    }
  };

  const logOut = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      resetStore();
      setUser(null);
      await supabase.auth.signOut();
      posthog.reset();
    }
  };

  const renderViewHelpText = () => {
    switch (view) {
      case ViewState.FORGOT:
        return (
          <span className="text-md text-muted-foreground">
            Forgot your password? Enter your email below to reset it
          </span>
        );
      case ViewState.RESET:
        return (
          <span className="text-md text-muted-foreground">
            Enter your new password below
          </span>
        );
      case ViewState.SIGNUP:
        return (
          <span className="text-md text-muted-foreground">
            Enter your email to signup
          </span>
        );
      case ViewState.LOGGED_IN:
        return (
          <span className="text-md text-muted-foreground">
            You are logged in as {user?.email}
          </span>
        );
      default:
        return (
          <span className="text-md text-muted-foreground">
            Enter your email to login
          </span>
        );
    }
  };

  return (
    <div className="grid gap-6">
      <Form {...form}>
        {renderViewHelpText()}
        <form>
          <div className="flex">
            {userMessage && (
              <span className="text-md text-muted-foreground">
                {userMessage}
              </span>
            )}
          </div>
          <div className="grid gap-4">
            {view !== ViewState.LOGGED_IN && (
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="vitalik@ethereum.org"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!includes([ViewState.FORGOT, ViewState.LOGGED_IN], view) && (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            disabled={isLoading}
                            autoComplete="current-password"
                            type="password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}
            {renderSubmitButton()}
            {includes([ViewState.SIGNUP, ViewState.LOGIN], view) && (
              <Button
                type="button"
                variant="outline"
                className="w-full shadow-none rounded-lg"
                disabled={isLoading}
                onClick={() => setView(ViewState.FORGOT)}
              >
                Forgot Password?
              </Button>
            )}
            {view === ViewState.LOGGED_IN && (
              <Button
                type="button"
                variant="outline"
                className="w-full shadow-none rounded-lg"
                disabled={isLoading}
                onClick={() => logOut()}
              >
                Not you? Log out
              </Button>
            )}
            {renderViewSwitchText()}
          </div>
        </form>
      </Form>
      {!signupOnly && view !== ViewState.LOGGED_IN && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">
                or continue with
              </span>
            </div>
          </div>
          <div className="flex flex-col space-y-4 items-center justify-center text-white">
            {!isAuthenticated ? (
              <SignInButton hideSignOut />
            ) : (
              <Button
                type="button"
                size="lg"
                className="py-4 text-white bg-[#8A63D2] hover:bg-[#6A4CA5] rounded-md"
                disabled
              >
                Signed in with Farcaster ☑️
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
