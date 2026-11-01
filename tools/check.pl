#!/usr/bin/perl
# Run every check. From the project root:
#
#   perl tools/check.pl
#
# These catch what clicking cannot -- a wrong value that still renders,
# and time-dependent rules you would otherwise have to sit and wait for.
# Everything else is verified by using the app in a browser.
use strict;
use warnings;

my @checks = (
  ['balance.pl', 'braces and strings',          [glob 'app/*.js']],
  ['i18n.pl',    'en / mr / hi parity',         []],
  ['data.pl',    'shop, catalogue and windows', []],
  ['slots.pl',   'the run state machine',       []],
  ['tokens.pl',  'both CSS palettes',           []],
  ['money.pl',   'cart arithmetic',             []],
);

my $failed = 0;
for my $c (@checks) {
  my ($script, $what, $args) = @$c;
  printf "\n=== %-12s %s\n", $script, $what;
  my $rc = system($^X, "tools/$script", @$args);
  $failed++ if $rc != 0;
}

print "\n", '-' x 52, "\n";
print $failed ? "$failed check(s) FAILED\n" : "all checks pass\n";
exit($failed ? 1 : 0);
