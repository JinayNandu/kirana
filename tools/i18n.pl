#!/usr/bin/perl
# Key parity, duplicate keys and placeholder parity across en / mr / hi.
#
#   perl tools/i18n.pl
#
# The duplicate check is the one that earns its keep. A repeated key in
# an object literal overwrites the earlier one SILENTLY, and counting
# keys does not catch it because the count still matches.
use strict;
use warnings;

my $file = 'app/i18n.js';
open my $fh, '<:encoding(UTF-8)', $file or die "$file: $!\n";
my @lines = <$fh>;
close $fh;

my (%T, %dup, $lang, $depth, @nocomma, $pending);
for my $raw (@lines) {
  my $line = $raw;
  $line =~ s{//.*$}{};                    # strip a trailing line comment

  if (!$lang && $line =~ /^\s{2}(en|mr|hi):\s*\{/) { $lang = $1; $depth = 1; next }
  next unless $lang;

  # A key is an identifier at the start of a line or just after a
  # comma -- never one that happens to sit inside a quoted value.
  # A value that ends a line with no comma is a SYNTAX ERROR which
  # leaves every brace and quote balanced, so balance.pl cannot see
  # it -- and the app then fails to parse at all. It has happened
  # twice. The error only shows on the NEXT line, so the suspect is
  # carried forward and cleared if a `}` follows.
  my $trimmed = $line; $trimmed =~ s/^\s+|\s+$//g;
  if ($pending && $trimmed ne '' && $trimmed !~ /^\}/) {
    push @nocomma, $pending;
  }
  $pending = undef if $trimmed ne '';

  my $last;
  while ($line =~ /(?:^|,)\s*([A-Za-z_]\w*)\s*:\s*'((?:[^'\\]|\\.)*)'/g) {
    my ($k, $v) = ($1, $2);
    push @{ $dup{$lang}{$k} }, $v;
    $T{$lang}{$k} = $v;
    $last = $k;
  }
  $pending = "$lang.$last" if defined $last && $trimmed =~ /'$/;

  my $opens = () = $line =~ /\{/g;
  my $closes = () = $line =~ /\}/g;
  $depth += $opens - $closes;
  $lang = undef if $depth <= 0;
}

my $bad = 0;

if (@nocomma) {
  print "MISSING COMMA after $_ -- the file will not parse at all\n" for @nocomma;
  $bad = 1;
}

for my $l (sort keys %T) {
  printf "%-3s %d keys\n", $l, scalar keys %{ $T{$l} };
}

# --- duplicates ------------------------------------------------------
for my $l (sort keys %dup) {
  for my $k (sort keys %{ $dup{$l} }) {
    my @v = @{ $dup{$l}{$k} };
    next if @v < 2;
    printf "DUPLICATE  %s.%s declared %d times -- the last one silently wins\n",
      $l, $k, scalar @v;
    $bad = 1;
  }
}

# --- key parity ------------------------------------------------------
unless (exists $T{en}) { die "no `en` block found -- parser is out of step with the file\n" }
for my $l (grep { $_ ne 'en' } sort keys %T) {
  for my $k (sort keys %{ $T{en} }) {
    next if exists $T{$l}{$k};
    print "MISSING    $l.$k\n"; $bad = 1;
  }
  for my $k (sort keys %{ $T{$l} }) {
    next if exists $T{en}{$k};
    print "EXTRA      $l.$k is not in en\n"; $bad = 1;
  }
}

# --- placeholder parity ----------------------------------------------
# A dropped {n} fails no other test. It prints the sentence with a
# hole in it, which looks like a bug in the app rather than in a string.
sub holes {
  my %h;
  $h{$1} = 1 while $_[0] =~ /\{(\w+)\}/g;
  return join ' ', sort keys %h;
}
for my $l (grep { $_ ne 'en' } sort keys %T) {
  for my $k (sort keys %{ $T{en} }) {
    next unless exists $T{$l}{$k};
    my $a = holes($T{en}{$k});
    my $b = holes($T{$l}{$k});
    next if $a eq $b;
    printf "PLACEHOLDER %s.%s  en has [%s], %s has [%s]\n", $l, $k, $a, $l, $b;
    $bad = 1;
  }
}

# --- untranslated copy-paste -----------------------------------------
# Not a failure on its own: some words really are the same. Reported so
# a human can glance down the list.
for my $l (grep { $_ ne 'en' } sort keys %T) {
  my @same = grep { exists $T{$l}{$_} && $T{$l}{$_} eq $T{en}{$_} && $T{en}{$_} =~ /\w/ }
             sort keys %{ $T{en} };
  printf "note: %d %s strings are identical to en (%s)\n",
    scalar @same, $l, join(', ', @same[0 .. ($#same > 5 ? 5 : $#same)]) if @same;
}

# --- double-encoded Devanagari ----------------------------------------
# A script edits i18n.js, decodes it to characters, splices in a byte
# string, and encodes the whole thing again. The Devanagari goes
# through UTF-8 twice and lands as a run of Latin-1 letters:
# 'DEVANAGARI' becomes 'Ã Â¤Â®Ã Â¤Â¾'. It still parses, the keys still
# match, the app still renders -- and what it renders is rubbish that
# nobody in this room can read well enough to notice. It happened, to
# 28 lines, and every other check in here passed while it was true.
#
# The tell is unambiguous: a Marathi or Hindi string has no business
# holding U+00C0..U+00FF, and real Devanagari never decodes to them.
for my $l (qw(mr hi)) {
  for my $k (sort keys %{ $T{$l} }) {
    my $v = $T{$l}{$k};
    next unless $v =~ /[\x{00C0}-\x{00FF}]/ && $v !~ /[\x{0900}-\x{097F}]/;
    printf "MOJIBAKE   %s.%s is double-encoded -- '%s...'\n",
      $l, $k, substr($v, 0, 20);
    $bad = 1;
  }
}

print $bad ? "\nFAIL\n" : "\nall three languages agree\n";
exit($bad ? 1 : 0);
